const {
  JWSPacker,
  byteEncoder,
  byteDecoder,
  KmsKeyType,
} = require("@0xpolygonid/js-sdk");
const { getInitializedRuntime } = require("./shared/bootstrap");
const {
  parseArgs,
  formatError,
  outputSuccess,
  createDidDocument,
  getAuthResponseMessage,
  buildEthereumAddressFromDid,
} = require("./shared/utils");
const { buildJsonAttestation } = require("./shared/attestation");

async function signChallenge(challenge, entry, kms) {
  const didDocument = createDidDocument(entry.did, entry.publicKeyHex);

  const resolveDIDDocument = {
    resolve: () => Promise.resolve({ didDocument }),
  };

  const jwsPacker = new JWSPacker(kms, resolveDIDDocument);

  challenge.attestationInfo = buildJsonAttestation({
    recipientDid: entry.did,
    recipientEthAddress: buildEthereumAddressFromDid(entry.did),
  });

  const authMessage = getAuthResponseMessage(entry.did, challenge);
  const msgBytes = byteEncoder.encode(JSON.stringify(authMessage));

  let token;
  try {
    token = await jwsPacker.pack(msgBytes, {
      alg: "ES256K-R",
      issuer: entry.did,
      did: entry.did,
      keyType: KmsKeyType.Secp256k1,
    });
  } catch (err) {
    throw new Error(`Failed to sign challenge: ${err.message}`);
  }

  return byteDecoder.decode(token);
}

async function main() {
  try {
    const args = parseArgs();

    if (!args.challenge) {
      console.error("Error: --challenge are required");
      console.error(
        "Usage: node scripts/signChallenge.js --challenge <challenge> [--did <did>]",
      );
      process.exit(1);
    }

    const { kms, didsStorage } = await getInitializedRuntime();

    // Get DID entry - either specific DID or default
    const entry = args.did
      ? await didsStorage.find(args.did)
      : await didsStorage.getDefault();

    if (!entry) {
      const errorMsg = args.did
        ? `No DID ${args.did} found`
        : "No default DID found";
      console.error(errorMsg);
      process.exit(1);
    }

    const challenge = JSON.parse(args.challenge);
    const tokenString = await signChallenge(challenge, entry, kms);

    outputSuccess({ success: true, data: { token: tokenString } });
  } catch (error) {
    console.error(formatError(error));
    process.exit(1);
  }
}

module.exports = { signChallenge };

// Run main if this script is executed directly (not imported as a module)
if (require.main === module) {
  main();
}
