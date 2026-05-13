const { createPairing } = require("./linkHumanToAgent");
const { parseArgs, outputError } = require("./shared/utils");

async function main() {
  try {
    const args = parseArgs();

    if (!args.challenge) {
      throw new Error(
        'Invalid arguments. Usage: node manualLinkHumanToAgent.js --challenge <json> [--did <did>]\nExample: node manualLinkHumanToAgent.js --challenge \'{"name": "Agent Name", "description": "Short description of the agent"}\'',
      );
    }

    const challenge = JSON.parse(args.challenge);
    const url = await createPairing(challenge, args.did);

    console.log(url);
  } catch (error) {
    outputError(error, true);
  }
}

main();
