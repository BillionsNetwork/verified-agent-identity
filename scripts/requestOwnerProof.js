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
  ownerProofTtlMs,
  getAgentOwner,
  parseQuerySpecs,
  buildScopes,
  describeRequest,
  createRelaySession,
  relayCallbackUrl,
} = require("./shared/ownerProof");
const {
  OwnerProofRequestsFileStorage,
} = require("./shared/storage/ownerProofRequests");

const usage =
  "Usage: node scripts/requestOwnerProof.js --agentDid <did> --query '<iden3 query JSON, or an array of them>' [--reason <text>] [--message <text>] [--requester <name>]";

/** The iden3comm authorization request the owner's wallet answers. */
function buildOwnerProofRequest({
  sessionId,
  agentDid,
  specs,
  reason,
  message,
  requester,
}) {
  // Sent from the pairing verifier DID so the owner's wallet answers with the
  // same profile that is recorded as the agent's owner (see ownerProof.js).
  const request = auth.createAuthorizationRequestWithMessage(
    reason || "owner_proof:v1",
    describeRequest({ agentDid, specs, requester, message }),
    verifierDid,
    relayCallbackUrl(sessionId),
    { scope: buildScopes(specs), accept },
  );
  // Fresh ids per request: the response's thid must match this request.
  request.id = uuidv4();
  request.thid = request.id;
  return request;
}

async function requestOwnerProof(args) {
  if (!args.agentDid) {
    throw new Error(`--agentDid is required. ${usage}`);
  }
  const specs = parseQuerySpecs(args.query);

  // Only agents linked to a human owner can be asked for an owner proof.
  const owner = await getAgentOwner(args.agentDid);
  if (!owner) {
    throw new Error(
      `Agent ${args.agentDid} is not linked to a human owner (no valid AgentOwnership attestation)`,
    );
  }

  const { sessionId } = await createRelaySession();
  const request = buildOwnerProofRequest({
    sessionId,
    agentDid: args.agentDid,
    specs,
    reason: args.reason,
    message: args.message,
    requester: args.requester,
  });

  const createdAt = Date.now();
  await new OwnerProofRequestsFileStorage().save({
    sessionId,
    agentDid: args.agentDid,
    ownerId: owner.ownerId,
    request,
    createdAt,
    expiresAt: createdAt + ownerProofTtlMs,
  });

  const link = await shortenToWalletLink(request);
  return {
    sessionId,
    agentDid: args.agentDid,
    asked: request.body.message,
    expiresAt: new Date(createdAt + ownerProofTtlMs).toISOString(),
    ownerLink: urlFormatting("Prove it in the Billions wallet", link),
    instructions: `Send this link to agent ${args.agentDid} and ask it to forward it to its owner. Then run: node scripts/verifyOwnerProof.js --sessionId ${sessionId}`,
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
