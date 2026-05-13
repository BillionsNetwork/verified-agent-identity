const { getInitializedRuntime } = require("./shared/bootstrap");
const { outputError, outputSuccess } = require("./shared/utils");

async function main() {
  try {
    const { didsStorage } = await getInitializedRuntime();

    const identities = await didsStorage.list();

    if (identities.length === 0) {
      throw new Error(
        "No identities found. Create one with createNewEthereumIdentity.js",
      );
    }

    outputSuccess(identities);
  } catch (error) {
    outputError(error, true);
  }
}

main();
