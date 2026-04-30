const { JWSPacker, byteEncoder } = require("@0xpolygonid/js-sdk");
const { getInitializedRuntime } = require("./shared/bootstrap");
const { parseArgs, formatError, outputSuccess } = require("./shared/utils");

async function main() {
  try {
    const args = parseArgs();

    if (!args.token) {
      console.error("Error: --token parameters is required");
      console.error(
        "Usage: node scripts/verifySignature.js --did <did> --token <token>",
      );
      process.exit(1);
    }

    const { kms, challengeStorage } = await getInitializedRuntime();

    // Get the stored challenge
    const challenge = await challengeStorage.getChallenge(args.did);
    if (!challenge) {
      console.error(`Error: No challenge found for DID: ${args.did}`);
      console.error("Generate a challenge first with generateChallenge.js");
      process.exit(1);
    }

    // Create DID resolver that fetches from remote resolver
    const resolveDIDDocument = {
      resolve: async (did) => {
        const resp = await fetch(
          `https://resolver.privado.id/1.0/identifiers/${did}`,
        );
        const didResolutionRes = await resp.json();
        return didResolutionRes;
      },
    };

    // Create JWS packer and unpack token
    const jws = new JWSPacker(kms, resolveDIDDocument);
    const basicMessage = await jws.unpack(byteEncoder.encode(args.token));

    // Verify the sender
    if (basicMessage.from !== args.did) {
      console.error(
        `Error: Invalid from: expected from ${args.did}, got ${basicMessage.from}`,
      );
      process.exit(1);
    }

    // Verify the challenge matches
    const payload = basicMessage.body;
    if (payload.message !== challenge) {
      console.error(
        `Error: Invalid signature: challenge mismatch ${payload.message} !== ${challenge}`,
      );
      process.exit(1);
    }

    outputSuccess("Signature verified successfully");
  } catch (error) {
    console.error(formatError(error));
    process.exit(1);
  }
}

main();
