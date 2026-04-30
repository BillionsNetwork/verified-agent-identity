const { ethers } = require("ethers");
const { DID } = require("@iden3/js-iden3-core");

const ATTESTATION_SCHEMA_ID =
  "0xca354bee6dc5eded165461d15ccb13aceb6f77ebbb1fd3fe45aca686097f2911"; // bytes32

const ATTESTER_DID = ""; // string
const ATTESTER_IDEN3_ID = 0n; // uint256
const ATTESTER_ETH_ADDRESS = "0x0000000000000000000000000000000000000000"; // address

const EXPIRATION_TIME = 0n; // uint256 — 0 means no expiration
const REVOCABLE = false; // bool
const REF_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000000"; // bytes32
const DATA = "0x"; // bytes

function extractIdFromDid(did) {
  return DID.idFromDID(DID.parse(did)).bigInt();
}

function buildJsonAttestation(req) {
  return {
    schemaId: ATTESTATION_SCHEMA_ID,
    attester: {
      did: ATTESTER_DID,
      iden3Id: ATTESTER_IDEN3_ID.toString(),
      ethereumAddress: ATTESTER_ETH_ADDRESS,
    },
    recipient: {
      did: req.recipientDid,
      iden3Id: extractIdFromDid(req.recipientDid).toString(),
      ethereumAddress: req.recipientEthAddress,
    },
    expirationTime: EXPIRATION_TIME.toString(),
    revocable: REVOCABLE,
    refId: REF_ID,
    data: DATA,
  };
}

function buildEncodedAttestation(req) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "bytes32", // schemaId
      "string", // attester.did
      "uint256", // attester.iden3Id
      "address", // attester.ethereumAddress
      "string", // recipient.did
      "uint256", // recipient.iden3Id
      "address", // recipient.ethereumAddress
      "uint256", // expirationTime
      "bool", // revocable
      "bytes32", // refId
      "bytes", // data
    ],
    [
      ATTESTATION_SCHEMA_ID,
      ATTESTER_DID,
      ATTESTER_IDEN3_ID,
      ATTESTER_ETH_ADDRESS,
      req.recipientDid,
      extractIdFromDid(req.recipientDid),
      req.recipientEthAddress,
      EXPIRATION_TIME,
      REVOCABLE,
      REF_ID,
      DATA,
    ],
  );
  return encoded;
}

function computeAttestationHash(req) {
  const hashHex = ethers.keccak256(buildEncodedAttestation(req));
  return (
    BigInt(hashHex) &
    BigInt("0x0FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")
  ).toString();
}

module.exports = {
  buildEncodedAttestation,
  computeAttestationHash,
  buildJsonAttestation,
};
