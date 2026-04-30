const { bytesToHex, keyPath } = require("@0xpolygonid/js-sdk");
const { DID, Id } = require("@iden3/js-iden3-core");
const { v7: uuid } = require("uuid");
const { secp256k1 } = require("@noble/curves/secp256k1");

/**
 * Removes the "0x" prefix from a hexadecimal string if it exists
 */
function normalizeKey(keyId) {
  return keyId.startsWith("0x") ? keyId.slice(2) : keyId;
}

/**
 * Add hex prefix if missing
 */
function addHexPrefix(keyId) {
  return keyId.startsWith("0x") ? keyId : `0x${keyId}`;
}

function buildEthereumAddressFromDid(did) {
  const ethereumAddress = Id.ethAddressFromId(DID.idFromDID(DID.parse(did)));
  return `0x${bytesToHex(ethereumAddress)}`;
}

/**
 * Creates a W3C DID document for an Ethereum-based identity
 */
function createDidDocument(did, publicKeyHex) {
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#ethereum-based-id`,
        controller: did,
        type: "EcdsaSecp256k1RecoveryMethod2020",
        ethereumAddress: buildEthereumAddressFromDid(did),
        publicKeyHex: secp256k1.Point.fromHex(publicKeyHex.slice(2)).toHex(
          true,
        ),
      },
    ],
    authentication: [`${did}#ethereum-based-id`],
  };
}

/**
 * Generates a normalized key path for storage
 */
function normalizedKeyPath(keyType, keyID) {
  return keyPath(keyType, normalizeKey(keyID));
}

/**
 * Creates an Authorization Response Message for challenge signing
 */
function getAuthResponseMessage(did, challenge) {
  const { PROTOCOL_CONSTANTS } = require("@0xpolygonid/js-sdk");
  return {
    id: uuid(),
    thid: uuid(),
    from: did,
    to: "",
    type: PROTOCOL_CONSTANTS.PROTOCOL_MESSAGE_TYPE
      .AUTHORIZATION_RESPONSE_MESSAGE_TYPE,
    body: {
      message: challenge,
      scope: [],
    },
  };
}

/**
 * Parses command line arguments into an object
 * Example: --did abc --key 123 => { did: 'abc', key: '123' }
 */
function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith("--")) {
      const key = process.argv[i].slice(2);
      const value = process.argv[i + 1];
      args[key] = value;
      i++;
    }
  }
  return args;
}

/**
 * Formats an error message for CLI output
 */
function formatError(error) {
  return `Error: ${error.message}`;
}

/**
 * Outputs success message to stdout
 */
function outputSuccess(data) {
  if (typeof data === "string") {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

function urlFormating(title, url) {
  return `[${title}](${url})`;
}

function codeFormating(data) {
  return `\\\`\\\`\\\`${data}\\\`\\\`\\\``;
}

module.exports = {
  normalizeKey,
  addHexPrefix,
  createDidDocument,
  normalizedKeyPath,
  getAuthResponseMessage,
  parseArgs,
  formatError,
  outputSuccess,
  buildEthereumAddressFromDid,
  urlFormating,
  codeFormating,
};
