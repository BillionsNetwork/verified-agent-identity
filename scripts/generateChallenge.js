const { randomInt } = require("crypto");
const { getInitializedRuntime } = require("./shared/bootstrap");
const { parseArgs, outputError, outputSuccess } = require("./shared/utils");

async function main() {
  try {
    const args = parseArgs();

    if (!args.did) {
      throw new Error(
        "--did parameter is required. Usage: node scripts/generateChallenge.js --did <did>",
      );
    }

    const { challengeStorage } = await getInitializedRuntime();

    // Generate random challenge
    const challenge = randomInt(0, 10000000000).toString();

    // Save challenge to storage
    await challengeStorage.save(args.did, challenge);

    outputSuccess(challenge);
  } catch (error) {
    outputError(error, true);
  }
}

main();
