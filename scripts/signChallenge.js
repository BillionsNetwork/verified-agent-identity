const {
  JWSPacker,
  byteEncoder,
  byteDecoder,
  KmsKeyType,
} = require("@0xpolygonid/js-sdk");
const { getInitializedRuntime } = require("./shared/bootstrap");
const {
  parseArgs,
  outputError,
  outputSuccess,
  createDidDocument,
  getAuthResponseMessage,
  buildEthereumAddressFromDid,
  getRequiredDidEntry,
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
      throw new Error(
        "--challenge is required. Usage: node scripts/signChallenge.js --challenge <challenge> [--did <did>]",
      );
    }

    const { kms, didsStorage } = await getInitializedRuntime();
    const entry = await getRequiredDidEntry(didsStorage, args.did);

    const challenge = JSON.parse(args.challenge);
    const tokenString = await signChallenge(challenge, entry, kms);

    outputSuccess({ token: tokenString });
  } catch (error) {
    outputError(error, true);
  }
}

module.exports = { signChallenge };

// Run main if this script is executed directly (not imported as a module)
if (require.main === module) {
  main();
}
