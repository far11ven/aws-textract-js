// ES5+ example, this doesn't rely on AWS-TEXTRACT credentials from config.js
const { TextractClient, AnalyzeDocumentCommand } = require("@aws-sdk/client-textract");
const config = require("./config");
const _ = require("lodash");

//profile = [default/work]
const client = new TextractClient({ profile: config.awsProfile, region: config.awsRegion });

 
  const getText = (result, blocksMap) => {
    let text = "";

    console.log(result)
  
    if (_.has(result, "Relationships") && result.Relationships !== undefined) {
      result.Relationships.forEach(relationship => {
        if (relationship.Type === "CHILD") {
          relationship.Ids.forEach(childId => {
            const word = blocksMap[childId];
            if (word.BlockType === "WORD") {
              text += `${word.Text} `;
            }
            if (word.BlockType === "SELECTION_ELEMENT") {
              if (word.SelectionStatus === "SELECTED") {
                text += `X `;
              }
            }
          });
        }
      });
    }
  
    return text.trim();
  };
  
  const findValueBlock = (keyBlock, valueMap) => {
    let valueBlock;
    keyBlock.Relationships.forEach(relationship => {
      if (relationship.Type === "VALUE") {
        // eslint-disable-next-line array-callback-return
        relationship.Ids.every(valueId => {
          if (_.has(valueMap, valueId)) {
            valueBlock = valueMap[valueId];
            return false;
          }
        });
      }
    });
  
    return valueBlock;
  };
  
  const getKeyValueRelationship = (keyMap, valueMap, blockMap) => {
    const keyValues = {};
  
    const keyMapValues = _.values(keyMap);
  
    keyMapValues.forEach(keyMapValue => {
      const valueBlock = findValueBlock(keyMapValue, valueMap);
      const key = getText(keyMapValue, blockMap);
      const value = getText(valueBlock, blockMap);
      keyValues[key] = value;
    });
  
    return keyValues;
  };
  
  const getKeyValueMap = blocks => {
    const keyMap = {};
    const valueMap = {};
    const blockMap = {};
  
    let blockId;
    blocks.forEach(block => {
      blockId = block.Id;
      blockMap[blockId] = block;
  
      if (block.BlockType === "KEY_VALUE_SET") {
        if (_.includes(block.EntityTypes, "KEY")) {
          keyMap[blockId] = block;
        } else {
          valueMap[blockId] = block;
        }
      }
    });
  
    return { keyMap, valueMap, blockMap };
  };
  
  module.exports = async buffer => {
    const params = {
      Document: {
        /* required */
        Bytes: buffer
      },
      FeatureTypes: ["FORMS"]
    };
  
    const command = new AnalyzeDocumentCommand(params);
    const data = await client.send(command);
    // console.log(data)
  
    if (data && data.Blocks) {
      const { keyMap, valueMap, blockMap } = getKeyValueMap(data.Blocks);
      const keyValues = getKeyValueRelationship(keyMap, valueMap, blockMap);
  
      return keyValues;
    }
  
    // in case no blocks are found return undefined
    return undefined;
  };
  