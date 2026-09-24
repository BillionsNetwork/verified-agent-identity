const { auth } = require("@iden3/js-iden3-auth");
const { v4: uuidv4 } = require("uuid");
const {
  parseArgs,
  outputSuccess,
  outputError,
  urlFormatting,
  shortenToWalletLink,
} = require("./shared/utils");
const { verifierDid, accept } = require("./shared/constants");
const {
  PROOF_TYPES,
  ownerProofTtlMs,
  getAgentOwner,
  parseCountries,
  parseAllowedIssuers,
  buildOwnerProofScope,
  createRelaySession,
  relayCallbackUrl,
} = require("./shared/ownerProof");
const {
  OwnerProofRequestsFileStorage,
} = require("./shared/storage/ownerProofRequests");

const usage =
  "Usage: node scripts/requestOwnerProof.js --agentDid <did> --proof <nationality|notSanctioned> [--countries IRN,PRK,...] [--allowedIssuers <did,did>] [--requester <name>]";

function describeRequest({ proofType, countries, agentDid, requester }) {
  const who = requester ? `${requester} asks` : "You are asked";
  return proofType === PROOF_TYPES.nationality
    ? `${who} to disclose your nationality as the owner of agent ${agentDid}. Only the nationality on your ID credential is shared.`
    : `${who} to prove, as the owner of agent ${agentDid}, that your nationality is not one of: ${countries.join(", ")}. Your nationality itself is not shared.`;
}

/** The iden3comm authorization request the owner's wallet answers. */
function buildOwnerProofRequest({
  sessionId,
  agentDid,
  proofType,
  countries,
  allowedIssuers,
  requester,
}) {
  // Sent from the pairing verifier DID so the owner's wallet answers with the
  // same profile that is recorded as the agent's owner (see ownerProof.js).
  const request = auth.createAuthorizationRequestWithMessage(
    `owner_proof:v1:${proofType}`,
    describeRequest({ proofType, countries, agentDid, requester }),
    verifierDid,
    relayCallbackUrl(sessionId),
    {
      scope: [buildOwnerProofScope({ proofType, countries, allowedIssuers })],
      accept,
    },
  );
  // Fresh ids per request: the response's thid must match this request.
  request.id = uuidv4();
  request.thid = request.id;
  return request;
}

async function requestOwnerProof(args) {
  const agentDid = args.agentDid;
  const proofType = args.proof;
  if (!agentDid || !Object.values(PROOF_TYPES).includes(proofType)) {
    throw new Error(`Invalid arguments. ${usage}`);
  }
  const countries =
    proofType === PROOF_TYPES.notSanctioned
      ? parseCountries(args.countries)
      : undefined;
  const allowedIssuers = parseAllowedIssuers(args.allowedIssuers);

  // Only agents linked to a human owner can be asked for an owner proof.
  const owner = await getAgentOwner(agentDid);
  if (!owner) {
    throw new Error(
      `Agent ${agentDid} is not linked to a human owner (no valid AgentOwnership attestation)`,
    );
  }

  const { sessionId } = await createRelaySession();
  const request = buildOwnerProofRequest({
    sessionId,
    agentDid,
    proofType,
    countries,
    allowedIssuers,
    requester: args.requester,
  });

  const createdAt = Date.now();
  await new OwnerProofRequestsFileStorage().save({
    sessionId,
    agentDid,
    ownerId: owner.ownerId,
    proofType,
    countries,
    allowedIssuers,
    request,
    createdAt,
    expiresAt: createdAt + ownerProofTtlMs,
  });

  const link = await shortenToWalletLink(request);
  return {
    sessionId,
    agentDid,
    proof: proofType,
    ...(countries ? { countries } : {}),
    expiresAt: new Date(createdAt + ownerProofTtlMs).toISOString(),
    ownerLink: urlFormatting("Prove it in the Billions wallet", link),
    instructions: `Send this link to agent ${agentDid} and ask it to forward it to its owner. Then run: node scripts/verifyOwnerProof.js --sessionId ${sessionId}`,
  };
}

async function main() {
  try {
    outputSuccess(await requestOwnerProof(parseArgs()));
  } catch (error) {
    outputError(error, true);
  }
}

module.exports = { requestOwnerProof, buildOwnerProofRequest };

if (require.main === module) {
  main();
}
