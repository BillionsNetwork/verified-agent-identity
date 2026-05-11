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

    if (!args.signature) {
      console.error("Error: --signature parameters is required");
      console.error(
        "Usage: node scripts/verifySignature.js --did <did> --signature <signature>",
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
    const basicMessage = await jws.unpack(byteEncoder.encode(args.signature));

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
