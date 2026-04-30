const { getInitializedRuntime } = require("./shared/bootstrap");
const {
  parseArgs,
  formatError,
  outputSuccess,
  createDidDocument,
} = require("./shared/utils");

async function main() {
  try {
    const args = parseArgs();
    const { didsStorage } = await getInitializedRuntime();

    // Get DID entry - either specific DID or default
    const entry = args.did
      ? await didsStorage.find(args.did)
      : await didsStorage.getDefault();

    if (!entry) {
      const errorMsg = args.did
        ? `No DID ${args.did} found`
        : "No default DID found. Create one with createNewEthereumIdentity.js";
      console.error(errorMsg);
      process.exit(1);
    }

    const didDocument = createDidDocument(entry.did, entry.publicKeyHex);

    outputSuccess({
      didDocument,
      did: entry.did,
    });
  } catch (error) {
    console.error(formatError(error));
    process.exit(1);
  }
}

main();
