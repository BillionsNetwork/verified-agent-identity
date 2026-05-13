const { bytesToHex } = require("@0xpolygonid/js-sdk");
const { DID, Id } = require("@iden3/js-iden3-core");
const { secp256k1 } = require("@noble/curves/secp256k1");

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

module.exports = {
  buildEthereumAddressFromDid,
  createDidDocument,
};
