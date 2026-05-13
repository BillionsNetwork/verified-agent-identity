const {
  parseArgs,
  urlFormatting,
  outputSuccess,
  outputError,
  createAuthRequestMessage,
  getRequiredDidEntry,
} = require("./shared/utils");
const { getInitializedRuntime } = require("./shared/bootstrap");
const { signChallenge } = require("./signChallenge");
const { createPOUScope, createAuthScope } = require("./shared/scopes");
const {
  transactionSender,
  verificationMessage,
} = require("./shared/constants");

/**
 * Creates a pairing URL for linking a human identity to the agent.
 * @param {object} challenge - Challenge object with name and description fields.
 * @param {string} [didOverride] - Optional DID to use instead of the default.
 * @returns {Promise<string>} The wallet URL the human must open to complete verification.
 */
async function createPairing(challenge, didOverride) {
  const { kms, didsStorage } = await getInitializedRuntime();
  const entry = await getRequiredDidEntry(didsStorage, didOverride);

  const recipientDid = entry.did;
  const signedChallenge = await signChallenge(challenge, entry, kms);

  const scope = [
    createPOUScope(transactionSender),
    createAuthScope(recipientDid),
  ];
  return await createAuthRequestMessage(signedChallenge, scope);
}

async function main() {
  try {
    const args = parseArgs();

    if (!args.challenge) {
      throw new Error(
        "Invalid arguments. Usage: node linkHumanToAgent.js --challenge <json> [--did <did>]",
      );
    }

    const challenge = JSON.parse(args.challenge);
    const url = await createPairing(challenge, args.did);

    outputSuccess(urlFormatting(verificationMessage, url));
  } catch (error) {
    outputError(error, true);
  }
}

module.exports = { createPairing };

if (require.main === module) {
  main();
}
