const { CircuitId } = require("@0xpolygonid/js-sdk");
const { computeAttestationHash } = require("./attestation");
const { buildEthereumAddressFromDid } = require("./utils");
const {
  nullifierSessionId,
  pouScopeId,
  pouAllowedIssuer,
  authScopeId,
  pouCredentialContext,
} = require("./constants");

function createPOUScope(transactionSender) {
  return {
    id: pouScopeId,
    circuitId: CircuitId.AtomicQueryV3OnChainStable,
    params: {
      sender: transactionSender,
      nullifierSessionId: nullifierSessionId,
    },
    query: {
      allowedIssuers: pouAllowedIssuer,
      type: "UniquenessCredential",
      context: pouCredentialContext,
    },
  };
}

function createAuthScope(recipientDid) {
  return {
    id: authScopeId,
    circuitId: CircuitId.AuthV3_8_32,
    params: {
      challenge: computeAttestationHash({
        recipientDid: recipientDid,
        recipientEthAddress: buildEthereumAddressFromDid(recipientDid),
      }),
    },
  };
}

module.exports = {
  createPOUScope,
  createAuthScope,
};
