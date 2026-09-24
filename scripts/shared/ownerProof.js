/**
 * Owner proofs: an agent's owner proves, off-chain and in zero knowledge,
 * either their nationality (selective disclosure) or that their nationality is
 * not in a list of sanctioned countries. The proof comes from the owner's
 * Billions wallet and is checked locally by the requesting party. Nothing
 * about nationality is ever written on-chain.
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

const basicPersonContext =
  "ipfs://QmZbsTnRwtCmbdg3r9o7Txid37LmvPcvmzVi1Abvqu1WKL";
const basicPersonType = "BasicPerson";
const nationalityField = "nationalities.nationality1CountryCode";

/**
 * BasicPerson issuers trusted by default: the Billions passport and Aadhaar
 * issuers and idOS (the production BasicPerson allow-list of the wallet).
 * Never `*`: anyone can issue a BasicPerson to themselves.
 */
const defaultAllowedIssuers = [
  "did:iden3:billions:test:2VxnoiNqdMPyMXmEKpP8wGqrY6Vb7mgeQQUywyVeWe",
  "did:iden3:billions:test:2VxnoiNqdMPxzqp7X6MV7GfoPkDZ7ij499mDZAo72y",
  "did:iden3:billions:main:2VwqkgA2dNEwsnmojaay7C5jJEb8ZygecqCSU3xVfm",
];

/**
 * Default "sanctioned countries" policy: the countries under comprehensive US
 * (OFAC) embargo, as ISO 3166-1 alpha-3 codes. Callers should pass the list
 * their own compliance policy requires with --countries.
 */
const defaultSanctionedCountries = ["CUB", "IRN", "PRK", "SYR"];

/** Largest $nin list the credentialAtomicQueryV3 circuit accepts. */
const maxSanctionedCountries = 64;

const ownerProofScopeId = 1;
const ownerProofTtlMs = 60 * 60 * 1000;

const PROOF_TYPES = {
  nationality: "nationality",
  notSanctioned: "notSanctioned",
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

function parseCountries(value) {
  const countries = (value ? value.split(",") : defaultSanctionedCountries)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(countries)];
  if (unique.length === 0) {
    throw new Error("--countries must list at least one country code");
  }
  const invalid = unique.filter((c) => !/^[A-Z]{3}$/.test(c));
  if (invalid.length) {
    throw new Error(
      `Country codes must be ISO 3166-1 alpha-3 (e.g. IRN): ${invalid.join(", ")}`,
    );
  }
  if (unique.length > maxSanctionedCountries) {
    throw new Error(
      `At most ${maxSanctionedCountries} countries can be checked in one proof`,
    );
  }
  return unique;
}

function parseAllowedIssuers(value) {
  if (!value) return defaultAllowedIssuers;
  const issuers = value
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (issuers.length === 0 || issuers.includes("*")) {
    throw new Error("--allowedIssuers must list explicit issuer DIDs");
  }
  issuers.forEach((d) => DID.parse(d));
  return issuers;
}

/** Builds the credentialAtomicQueryV3 scope for the requested proof. */
function buildOwnerProofScope({ proofType, countries, allowedIssuers }) {
  let credentialSubject;
  if (proofType === PROOF_TYPES.nationality) {
    // Selective disclosure: the wallet reveals only this one field.
    credentialSubject = { [nationalityField]: {} };
  } else if (proofType === PROOF_TYPES.notSanctioned) {
    credentialSubject = { [nationalityField]: { $nin: countries } };
  } else {
    throw new Error(
      `Unknown proof type ${proofType}. Use "nationality" or "notSanctioned"`,
    );
  }
  return {
    id: ownerProofScopeId,
    circuitId: CircuitId.AtomicQueryV3Stable,
    query: {
      allowedIssuers,
      context: basicPersonContext,
      type: basicPersonType,
      credentialSubject,
    },
  };
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

/** The disclosed nationality from a selective-disclosure proof response. */
function disclosedNationality(scopeResponse) {
  const subject = scopeResponse?.vp?.verifiableCredential?.credentialSubject;
  const value = subject?.nationalities?.nationality1CountryCode;
  return typeof value === "string" ? value : undefined;
}

module.exports = {
  PROOF_TYPES,
  basicPersonContext,
  basicPersonType,
  nationalityField,
  defaultAllowedIssuers,
  defaultSanctionedCountries,
  ownerProofScopeId,
  ownerProofTtlMs,
  getAgentOwner,
  iden3IdFromDid,
  parseCountries,
  parseAllowedIssuers,
  buildOwnerProofScope,
  createRelaySession,
  fetchRelaySession,
  relayCallbackUrl,
  disclosedNationality,
};
