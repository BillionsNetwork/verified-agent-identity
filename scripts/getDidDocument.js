const { getInitializedRuntime } = require("./shared/bootstrap");
const {
  parseArgs,
  outputError,
  outputSuccess,
  createDidDocument,
  getRequiredDidEntry,
} = require("./shared/utils");

async function main() {
  try {
    const args = parseArgs();
    const { didsStorage } = await getInitializedRuntime();
    const entry = await getRequiredDidEntry(didsStorage, args.did);

    const didDocument = createDidDocument(entry.did, entry.publicKeyHex);

    outputSuccess({
      didDocument,
      did: entry.did,
    });
  } catch (error) {
    outputError(error, true);
  }
}

main();
