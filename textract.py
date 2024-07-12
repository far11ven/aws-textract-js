import boto3.session
import pagexml
from botocore.exceptions import ClientError
from datetime import datetime
from io import BytesIO
from pagexmltools.convert import textract_to_pagexml
from pagexmltools.pages import add_page_region
from PIL import Image

from airflow.exceptions import AirflowException


def new_aws_session():
    """This just calls boto3.session.Session without any arguments.

    Authentication should be configured through environment variables as explained in
    https://boto3.amazonaws.com/v1/documentation/api/latest/guide/configuration.html?#using-environment-variables
    """
    return boto3.session.Session()


supported_textract_methods = ["detect_document_text", "analyze_document"]


def check_textract_parameters(parameters: dict):
    """Raises AirflowException if an unsupported method is given."""
    if "method" not in parameters:
        parameters["method"] = supported_textract_methods[0]
    elif parameters["method"] not in supported_textract_methods:
        raise AirflowException(f"Unsupported aws-textract method: {parameters['method']}")


def run_textract(aws_session: boto3.session.Session, image_content: bytes, image_name: str, parameters: dict) -> pagexml.PageXML:
    """Process an image using the specified textract method and returns the result in page xml."""
    start_time = datetime.now()
    parameters = dict(parameters)
    detect_orientation = parameters.pop("detect-orientation", True)
    method_name = parameters.pop("method")
    client = aws_session.client("textract")
    if not hasattr(client, method_name):
        raise AirflowException(f"Unsupported textract client method: {method_name}")

    # Run textract
    method = getattr(client, method_name)
    try:
        result = method(Document={"Bytes": image_content}, **parameters)
    except ClientError as ex:
        raise AirflowException(f"Problems running textract: {ex}") from ex

    # Convert to page xml
    image_size = Image.open(BytesIO(image_content)).size
    pxml = textract_to_pagexml(result, image_name, image_size=image_size, detect_orientation=detect_orientation, searchink_schema=True)

    # Add Process element with correct started and time attributes
    tool = f"AWS-Textract; method={method_name}"
    if parameters:
        tool += f"; parameters={parameters}"
    pxml.processStart(tool)
    pxml.processEnd()
    xproc = pxml.selectNth("//_:Process", -1)
    pxml.setAttr(xproc, "started", start_time.replace(microsecond=0).isoformat()+'Z')
    pxml.setAttr(xproc, "time", str((datetime.now()-start_time).total_seconds()))

    return pxml