/**
 * Owner proofs: an agent's human owner answers an arbitrary iden3 query, in
 * zero knowledge and off-chain, from their Billions wallet. Examples:
 * disclose a nationality, prove a nationality is not in a list, prove being
 * over 18, prove holding a membership credential. The proof is checked
 * locally by the requesting party. Nothing is written on-chain.
 *
 * Binding to the agent: the owner linked the agent through the pairing flow,
 * which records an AgentOwnership attestation whose attester is the owner's
 * wallet profile for the pairing verifier DID. Owner proof requests are sent
 * from that same verifier DID, so the wallet answers with the same profile,
 * and the proof's identity must equal the attestation's attester.
 */
const { ethers } = require("ethers");
const { CircuitId } = require("@0xpolygonid/js-sdk");
const { DID, Id } = require("@iden3/js-iden3-core");
const { rpcUrl, schemaId: agentOwnershipSchemaId } = require("./constants");
const { fetchWithTimeout } = require("./utils/auth");

const ownerProofRelayBase =
  process.env.BILLIONS_OWNER_PROOF_RELAY_URL ||
  "https://attestation-relay.billions.network/api/v1/owner-proof";

const attestationRegistryAddress = "0x6dd6Ad465E93bcb345010ECEf3cFC9144e87b6cC";

const ownerProofTtlMs = 60 * 60 * 1000;
const defaultCircuitId = CircuitId.AtomicQueryV3Stable;
const maxScopes = 5;

/** Off-chain query circuits an owner proof may use. */
const allowedCircuitIds = [
  CircuitId.AtomicQueryV3Stable,
  CircuitId.AtomicQueryV3,
  CircuitId.AtomicQuerySigV2,
  CircuitId.AtomicQueryMTPV2,
];

/** iden3 query operators. `{}` (no operator) is selective disclosure. */
const operators = [
  "$eq",
  "$ne",
  "$lt",
  "$lte",
  "$gt",
  "$gte",
  "$in",
  "$nin",
  "$between",
  "$nonbetween",
  "$exists",
];

const operatorText = {
  $eq: "is",
  $ne: "is not",
  $lt: "is less than",
  $lte: "is at most",
  $gt: "is greater than",
  $gte: "is at least",
  $in: "is one of",
  $nin: "is not one of",
  $between: "is between",
  $nonbetween: "is not between",
  $exists: "exists:",
};

const registryAbi = [
  "function getAttestationsByRecipientIden3IdAndSchemaId(uint256 recipientIden3Id, bytes32 schemaId) view returns (bytes32[])",
  "function isAttestationValid(bytes32 id) view returns (bool)",
  "function getAttestation(bytes32 id) view returns (tuple(bytes32 id, bytes32 schemaId, uint64 creationTime, uint64 expirationTime, uint64 revocationTime, tuple(string did, uint256 iden3Id, address ethereumAddress) attester, tuple(string did, uint256 iden3Id, address ethereumAddress) recipient, bool revocable, bytes32 refId, bytes data))",
];

function iden3IdFromDid(did) {
  return DID.idFromDID(DID.parse(did)).bigInt();
}

/**
 * Reads the agent's owner from the on-chain AgentOwnership attestation.
 * Returns the newest valid attestation's attester, or null if the agent has
 * no valid owner.
 */
async function getAgentOwner(agentDid, { provider } = {}) {
  const registry = new ethers.Contract(
    attestationRegistryAddress,
    registryAbi,
    provider || new ethers.JsonRpcProvider(rpcUrl),
  );
  const ids = await registry.getAttestationsByRecipientIden3IdAndSchemaId(
    iden3IdFromDid(agentDid),
    agentOwnershipSchemaId,
  );
  let newest = null;
  for (const id of ids) {
    if (!(await registry.isAttestationValid(id))) continue;
    const attestation = await registry.getAttestation(id);
    if (!newest || attestation.creationTime > newest.creationTime) {
      newest = attestation;
    }
  }
  if (!newest) return null;
  // The registry records the attester's iden3 id from the pairing proof; the
  // DID string field is left empty, so the DID is derived from the id.
  const ownerId = newest.attester.iden3Id;
  return {
    attestationId: newest.id,
    ownerDid:
      newest.attester.did || DID.parseFromId(Id.fromBigInt(ownerId)).string(),
    ownerId: ownerId.toString(),
    linkedAt: new Date(Number(newest.creationTime) * 1000).toISOString(),
  };
}

/**
 * Validates one query spec and normalizes it to `{ circuitId, query, params }`.
 * A spec is either a bare iden3 query (`{ allowedIssuers, context, type,
 * credentialSubject? }`) or `{ circuitId?, query, params? }`.
 */
function normalizeQuerySpec(spec, index) {
  const where = `query #${index + 1}`;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error(`${where} must be an object`);
  }
  const isWrapped = spec.query && typeof spec.query === "object";
  const query = isWrapped ? spec.query : spec;
  const circuitId = (isWrapped && spec.circuitId) || defaultCircuitId;
  const params = isWrapped ? spec.params : undefined;

  if (!allowedCircuitIds.includes(circuitId)) {
    throw new Error(
      `${where}: circuitId must be one of ${allowedCircuitIds.join(", ")}`,
    );
  }
  if (typeof query.type !== "string" || !query.type) {
    throw new Error(`${where}: "type" (credential type) is required`);
  }
  if (typeof query.context !== "string" || !query.context) {
    throw new Error(`${where}: "context" (JSON-LD context URL) is required`);
  }
  // Never "*": anyone can issue themselves any credential, so a query that
  // accepts every issuer proves nothing about the owner.
  const issuers = query.allowedIssuers;
  if (
    !Array.isArray(issuers) ||
    issuers.length === 0 ||
    issuers.includes("*")
  ) {
    throw new Error(
      `${where}: "allowedIssuers" must list the trusted issuer DIDs explicitly`,
    );
  }
  issuers.forEach((d) => DID.parse(d));

  const subject = query.credentialSubject;
  if (subject !== undefined) {
    if (typeof subject !== "object" || Array.isArray(subject)) {
      throw new Error(`${where}: "credentialSubject" must be an object`);
    }
    const fields = Object.keys(subject);
    // The atomic query circuits constrain a single field per query; use one
    // query per condition.
    if (fields.length > 1) {
      throw new Error(
        `${where}: only one credentialSubject field per query; add another query for each extra condition`,
      );
    }
    for (const field of fields) {
      const condition = subject[field];
      if (!condition || typeof condition !== "object") {
        throw new Error(
          `${where}: condition for "${field}" must be an object such as {"$lt": 20080101} or {} to disclose`,
        );
      }
      const ops = Object.keys(condition);
      if (ops.length > 1) {
        throw new Error(`${where}: one operator per field ("${field}")`);
      }
      if (ops.length === 1 && !operators.includes(ops[0])) {
        throw new Error(
          `${where}: unknown operator ${ops[0]}. Use one of ${operators.join(", ")}`,
        );
      }
    }
  }
  return { circuitId, query, ...(params ? { params } : {}) };
}

/** Parses `--query` JSON: one query spec or an array of them. */
function parseQuerySpecs(json) {
  if (!json) {
    throw new Error("--query is required (an iden3 query as JSON)");
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`--query is not valid JSON: ${e.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0 || list.length > maxScopes) {
    throw new Error(`--query must contain between 1 and ${maxScopes} queries`);
  }
  return list.map(normalizeQuerySpec);
}

/** Builds the proof request scopes, numbered from 1. */
function buildScopes(specs) {
  return specs.map((spec, i) => ({ id: i + 1, ...spec }));
}

/** Plain-language description of one condition, shown to the owner. */
function describeQuery(query) {
  const [field] = Object.keys(query.credentialSubject || {});
  if (!field) return `that you hold a ${query.type} credential`;
  const condition = query.credentialSubject[field];
  const [op] = Object.keys(condition);
  if (!op) return `your ${field} from your ${query.type} credential`;
  const value = condition[op];
  const text = Array.isArray(value) ? value.join(", ") : JSON.stringify(value);
  return `that ${field} on your ${query.type} credential ${operatorText[op]} ${text}`;
}

function describeRequest({ agentDid, specs, requester, message }) {
  if (message) return message;
  const who = requester ? `${requester} asks you` : "You are asked";
  const parts = specs.map((s) => describeQuery(s.query));
  return `${who}, as the owner of agent ${agentDid}, to prove ${parts.join("; and ")}. Only disclosed fields are shared.`;
}

function getPath(obj, path) {
  return path
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/**
 * The values a selective-disclosure query revealed, keyed by field path.
 * Empty for queries that only prove a condition.
 */
function disclosedValues(scope, scopeResponse) {
  const subject = scopeResponse?.vp?.verifiableCredential?.credentialSubject;
  const disclosed = {};
  for (const [field, condition] of Object.entries(
    scope.query.credentialSubject || {},
  )) {
    if (Object.keys(condition).length === 0) {
      disclosed[field] = getPath(subject, field);
    }
  }
  return disclosed;
}

async function createRelaySession() {
  const response = await fetchWithTimeout(`${ownerProofRelayBase}/sessions`, {
    method: "POST",
  });
  if (response.status !== 201) {
    throw new Error(
      `Owner proof relay refused to create a session (status ${response.status})`,
    );
  }
  return response.json();
}

async function fetchRelaySession(sessionId) {
  const response = await fetchWithTimeout(
    `${ownerProofRelayBase}/session?sessionId=${encodeURIComponent(sessionId)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Owner proof relay lookup failed (status ${response.status})`,
    );
  }
  return response.json();
}

function relayCallbackUrl(sessionId) {
  return `${ownerProofRelayBase}/callback?sessionId=${encodeURIComponent(sessionId)}`;
}

module.exports = {
  ownerProofTtlMs,
  getAgentOwner,
  iden3IdFromDid,
  parseQuerySpecs,
  normalizeQuerySpec,
  buildScopes,
  describeRequest,
  disclosedValues,
  createRelaySession,
  fetchRelaySession,
  relayCallbackUrl,
};
