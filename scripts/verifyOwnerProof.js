const { auth, resolver } = require("@iden3/js-iden3-auth");
const {
  parseArgs,
  outputSuccess,
  outputError,
  outputInputRequired,
} = require("./shared/utils");
const {
  rpcUrl,
  testnetRpcUrl,
  stateContractAddress,
  ipfsGatewayUrl,
} = require("./shared/constants");
const {
  getAgentOwner,
  iden3IdFromDid,
  fetchRelaySession,
  disclosedValues,
} = require("./shared/ownerProof");
const {
  OwnerProofRequestsFileStorage,
} = require("./shared/storage/ownerProofRequests");

async function newVerifier({ documentLoader } = {}) {
  return auth.Verifier.newVerifier({
    ...(documentLoader ? { documentLoader } : {}),
    // Needed to load the BasicPerson schema and context (ipfs://) for
    // query verification.
    ipfsGatewayURL: ipfsGatewayUrl,
    stateResolver: {
      "billions:main": new resolver.EthStateResolver(
        rpcUrl,
        stateContractAddress,
      ),
      "billions:test": new resolver.EthStateResolver(
        testnetRpcUrl,
        stateContractAddress,
      ),
    },
  });
}

/**
 * Checks a completed owner proof. Every check runs here, against the request
 * this agent stored, so the relay that delivered the proof is not trusted:
 *
 * 1. The zero-knowledge proofs are valid, answer this exact request (thread
 *    id and every query: credential type, issuers, field, operator, values)
 *    and come from an unrevoked credential.
 * 2. The prover is the agent's owner: the proof's identity equals the
 *    attester of the agent's current on-chain AgentOwnership attestation.
 *
 * The result lists each proven query and, for selective-disclosure queries,
 * the disclosed values. Deciding whether that satisfies a policy is up to
 * the caller.
 */
async function checkOwnerProof({ stored, token, verifier, getOwner }) {
  const response = await verifier.fullVerify(token, stored.request);

  // fullVerify checks the proofs against the queries but not that the
  // response answers this particular request. The thid is inside the signed
  // JWZ payload, so this stops a proof made for one request from being
  // replayed against another request with the same queries.
  if (response.thid !== stored.request.thid) {
    throw new Error("The proof answers a different owner proof request");
  }

  const owner = await getOwner(stored.agentDid);
  if (!owner) {
    throw new Error(
      `Agent ${stored.agentDid} no longer has a valid owner attestation`,
    );
  }
  const proverId = iden3IdFromDid(response.from).toString();
  if (proverId !== owner.ownerId) {
    throw new Error(
      `The proof was not produced by the owner of agent ${stored.agentDid}`,
    );
  }

  const responses = response.body.scope || [];
  const proofs = stored.request.body.scope.map((scope) => {
    const scopeResponse = responses.find(
      (s) => Number(s.id) === Number(scope.id),
    );
    if (!scopeResponse) {
      throw new Error(`The response contains no proof for query #${scope.id}`);
    }
    const disclosed = disclosedValues(scope, scopeResponse);
    for (const [field, value] of Object.entries(disclosed)) {
      if (value === undefined) {
        throw new Error(`The proof did not disclose ${field}`);
      }
    }
    return {
      queryId: scope.id,
      type: scope.query.type,
      context: scope.query.context,
      allowedIssuers: scope.query.allowedIssuers,
      credentialSubject: scope.query.credentialSubject || {},
      ...(Object.keys(disclosed).length ? { disclosed } : {}),
    };
  });

  return {
    verified: true,
    agentDid: stored.agentDid,
    ownerDid: owner.ownerDid,
    asked: stored.request.body.message,
    proofs,
    verifiedAt: new Date().toISOString(),
  };
}

async function main() {
  try {
    const { sessionId } = parseArgs();
    if (!sessionId) {
      throw new Error(
        "--sessionId is required. Usage: node scripts/verifyOwnerProof.js --sessionId <id>",
      );
    }

    const stored = await new OwnerProofRequestsFileStorage().find(sessionId);
    if (!stored) {
      throw new Error(
        `No owner proof request ${sessionId} was created by this agent`,
      );
    }
    if (Date.now() > stored.expiresAt) {
      throw new Error(`Owner proof request ${sessionId} has expired`);
    }

    const session = await fetchRelaySession(sessionId);
    if (!session) {
      throw new Error(`Owner proof request ${sessionId} has expired`);
    }
    if (session.status !== "completed" || !session.token) {
      return outputInputRequired({
        state: "pending",
        message:
          "The owner has not completed the proof yet. Ask again later; do not act on it until it is verified.",
      });
    }

    const result = await checkOwnerProof({
      stored,
      token: session.token,
      verifier: await newVerifier(),
      getOwner: getAgentOwner,
    });
    outputSuccess(result);
  } catch (error) {
    outputError(error, true);
  }
}

module.exports = { checkOwnerProof, newVerifier };

if (require.main === module) {
  main();
}

