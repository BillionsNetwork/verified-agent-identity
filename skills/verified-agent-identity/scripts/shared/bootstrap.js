const {
  KMS,
  Sec256k1Provider,
  KmsKeyType,
  IdentityWallet,
  CredentialStatusType,
  EthStateStorage,
  CredentialStorage,
  IdentityStorage,
  InMemoryMerkleTreeStorage,
  CredentialStatusResolverRegistry,
  RHSResolver,
  CredentialWallet,
  defaultEthConnectionConfig,
  BjjProvider,
} = require("@0xpolygonid/js-sdk");

const { KeysFileStorage } = require("./storage/keys");
const { IdentitiesFileStorage } = require("./storage/identities");
const { DidsFileStorage } = require("./storage/did");
const { ChallengeFileStorage } = require("./storage/challenge");

let cachedRuntime = null;

/**
 * Creates and configures the KMS (Key Management System)
 */
async function newInMemoryKMS() {
  const memoryKeyStore = new KeysFileStorage("kms.json");
  const secpProvider = new Sec256k1Provider(
    KmsKeyType.Secp256k1,
    memoryKeyStore,
  );
  const bjjProvider = new BjjProvider(KmsKeyType.BabyJubJub, memoryKeyStore);
  const kms = new KMS();
  kms.registerKeyProvider(KmsKeyType.Secp256k1, secpProvider);
  kms.registerKeyProvider(KmsKeyType.BabyJubJub, bjjProvider);
  return kms;
}

/**
 * Creates Ethereum state storage for Billions Network
 */
function newEthStateStorage(billionsMainnetConfig) {
  return new EthStateStorage(billionsMainnetConfig);
}

/**
 * Creates data storage with credential, identity, merkle tree, and state storages
 */
function newDataStorage(ethStateStorage) {
  return {
    credential: new CredentialStorage(
      new IdentitiesFileStorage("credentials.json"),
    ),
    identity: new IdentityStorage(
      new IdentitiesFileStorage("identities.json"),
      new IdentitiesFileStorage("profiles.json"),
    ),
    mt: new InMemoryMerkleTreeStorage(40),
    states: ethStateStorage,
  };
}

/**
 * Creates credential wallet with credential status resolvers
 */
function newCredentialWallet(dataStorage) {
  const resolvers = new CredentialStatusResolverRegistry();
  resolvers.register(
    CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
    new RHSResolver(dataStorage.states),
  );
  return new CredentialWallet(dataStorage, resolvers);
}

/**
 * Creates identity wallet
 */
function newIdentityWallet(kms, dataStorage, credentialWallet) {
  return new IdentityWallet(kms, dataStorage, credentialWallet);
}

/**
 * Gets Billions Network mainnet configuration
 */
function getBillionsMainnetConfig() {
  return {
    ...defaultEthConnectionConfig,
    url: "https://rpc-mainnet.billions.network",
    contractAddress: "0x3c9acb2205aa72a05f6d77d708b5cf85fca3a896",
    chainId: 45056,
  };
}

/**
 * Gets default revocation options
 */
function getRevocationOpts() {
  return {
    type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
    id: "https://rhs-staging.polygonid.me",
  };
}

/**
 * Initializes and returns all runtime dependencies.
 * Uses caching to avoid re-initialization.
 * 
 * @returns {Promise<Object>} Runtime object containing:
 *   - kms: Key Management System
 *   - identityWallet: Identity wallet instance
 *   - didsStorage: DID storage
 *   - challengeStorage: Challenge storage
 *   - billionsMainnetConfig: Billions Network configuration
 *   - revocationOpts: Revocation options
 */
async function getInitializedRuntime() {
  if (cachedRuntime) {
    return cachedRuntime;
  }

  const billionsMainnetConfig = getBillionsMainnetConfig();
  const revocationOpts = getRevocationOpts();

  const kms = await newInMemoryKMS();
  const stateStorage = newEthStateStorage(billionsMainnetConfig);
  const dataStorage = newDataStorage(stateStorage);
  const credentialWallet = newCredentialWallet(dataStorage);
  const identityWallet = newIdentityWallet(kms, dataStorage, credentialWallet);

  const didsStorage = new DidsFileStorage("defaultDid.json");
  const challengeStorage = new ChallengeFileStorage("challenges.json");

  cachedRuntime = {
    kms,
    identityWallet,
    didsStorage,
    challengeStorage,
    billionsMainnetConfig,
    revocationOpts,
  };

  return cachedRuntime;
}

module.exports = {
  getInitializedRuntime,
};
