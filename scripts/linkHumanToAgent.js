const { auth } = require("@iden3/js-iden3-auth");
const { CircuitId } = require("@0xpolygonid/js-sdk");
const {
  buildEthereumAddressFromDid,
  parseArgs,
  urlFormating,
  outputSuccess,
  formatError,
} = require("./shared/utils");
const { computeAttestationHash } = require("./shared/attestation");
const { getInitializedRuntime } = require("./shared/bootstrap");
const { signChallenge } = require("./signChallenge");
const {
  transactionSender,
  verifierDid,
  callbackBase,
  walletAddress,
  verificationMessage,
  pairingReasonMessage,
  accept,
  nullifierSessionId,
  pouScopeId,
  pouAllowedIssuer,
  authScopeId,
  urlShortener,
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
      context: "ipfs://QmcUEDa42Er4nfNFmGQVjiNYFaik6kvNQjfTeBrdSx83At",
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

async function createAuthRequestMessage(jws, recipientDid) {
  const callback = callbackBase + jws;
  const scope = [
    createPOUScope(transactionSender),
    createAuthScope(recipientDid),
  ];

  const message = auth.createAuthorizationRequestWithMessage(
    pairingReasonMessage,
    verificationMessage,
    verifierDid,
    encodeURI(callback),
    {
      scope,
      accept: accept,
    },
  );

  // the code does request to trusted URL shortener service to create
  // a short link for the wallet deep link.
  // This is needed to avoid issues with very long URLs in some wallets and to improve user experience.
  const shortenerResponse = await fetch(`${urlShortener}/shortener`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (shortenerResponse.status !== 201) {
    throw new Error(
      `URL shortener failed with status ${shortenerResponse.status}`,
    );
  }

  const { url } = await shortenerResponse.json();

  return `${walletAddress}#request_uri=${url}`;
}

/**
 * Creates a pairing URL for linking a human identity to the agent.
 * @param {object} challenge - Challenge object with name and description fields.
 * @param {string} [didOverride] - Optional DID to use instead of the default.
 * @returns {Promise<string>} The wallet URL the human must open to complete verification.
 */
async function createPairing(challenge, didOverride) {
  const { kms, didsStorage } = await getInitializedRuntime();

  const entry = didOverride
    ? await didsStorage.find(didOverride)
    : await didsStorage.getDefault();

  if (!entry) {
    const errorMsg = didOverride
      ? `No DID ${didOverride} found`
      : "No default DID found";
    throw new Error(errorMsg);
  }

  const recipientDid = entry.did;
  const signedChallenge = await signChallenge(challenge, entry, kms);

  return await createAuthRequestMessage(signedChallenge, recipientDid);
}

async function main() {
  try {
    const args = parseArgs();

    if (!args.challenge) {
      console.error(
        JSON.stringify({
          success: false,
          error:
            "Invalid arguments. Usage: node linkHumanToAgent.js --challenge <json> [--did <did>]",
        }),
      );
      process.exit(1);
    }

    const challenge = JSON.parse(args.challenge);
    const url = await createPairing(challenge, args.did);

    outputSuccess({
      success: true,
      data: urlFormating(verificationMessage, url),
    });
  } catch (error) {
    console.error(formatError(error));
    process.exit(1);
  }
}

module.exports = { createPairing };

if (require.main === module) {
  main();
}
