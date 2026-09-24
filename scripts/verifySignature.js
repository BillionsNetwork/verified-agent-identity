const { JWSPacker, byteEncoder } = require("@0xpolygonid/js-sdk");
const { getInitializedRuntime } = require("./shared/bootstrap");
const {
  parseArgs,
  outputError,
  outputSuccess,
  fetchWithTimeout,
} = require("./shared/utils");
const { resolverUrl } = require("./shared/constants");

async function main() {
  try {
    const args = parseArgs();

    // The reference docs use --token; --signature is kept for older callers.
    const token = args.token || args.signature;
    if (!args.did || !token) {
      throw new Error(
        "--did and --token are required. Usage: node scripts/verifySignature.js --did <did> --token <token>",
      );
    }

    const { kms, challengeStorage } = await getInitializedRuntime();

    // Get the stored challenge
    const challenge = await challengeStorage.getChallenge(args.did);
    if (!challenge) {
      throw new Error(
        `No challenge found for DID: ${args.did}. Generate a challenge first with generateChallenge.js`,
      );
    }

    // Create DID resolver that fetches from remote resolver
    const resolveDIDDocument = {
      resolve: async (did) => {
        const resp = await fetchWithTimeout(`${resolverUrl}/${did}`);
        const didResolutionRes = await resp.json();
        return didResolutionRes;
      },
    };

    // Create JWS packer and unpack signature
    const jws = new JWSPacker(kms, resolveDIDDocument);
    const basicMessage = await jws.unpack(byteEncoder.encode(token));

    // Verify the sender
    if (basicMessage.from !== args.did) {
      throw new Error(
        `Invalid from: expected from ${args.did}, got ${basicMessage.from}`,
      );
    }

    // Verify the challenge matches
    const payload = basicMessage.body;
    if (payload.message !== challenge) {
      throw new Error(
        `Invalid signature: challenge mismatch ${payload.message} !== ${challenge}`,
      );
    }

    outputSuccess("Signature verified successfully");
  } catch (error) {
    outputError(error, true);
  }
}

main();
