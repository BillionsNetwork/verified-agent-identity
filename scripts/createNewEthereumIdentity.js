const { hexToBytes } = require("@0xpolygonid/js-sdk");
const { DidMethod, Blockchain, NetworkId } = require("@iden3/js-iden3-core");
const { SigningKey, Wallet, JsonRpcProvider } = require("ethers");
const { getInitializedRuntime } = require("./shared/bootstrap");
const {
  parseArgs,
  outputError,
  outputSuccess,
  addHexPrefix,
} = require("./shared/utils");

async function main() {
  try {
    const args = parseArgs();
    const {
      identityWallet,
      didsStorage,
      billionsMainnetConfig,
      revocationOpts,
    } = await getInitializedRuntime();

    // Use provided key or generate a new one
    let privateKeyHex = args.key;
    if (!privateKeyHex) {
      privateKeyHex = new SigningKey(Wallet.createRandom().privateKey)
        .privateKey;
    }

    // Create signer from private key
    const signer = new SigningKey(addHexPrefix(privateKeyHex));

    // Create wallet with Billions Network provider
    const wallet = new Wallet(
      signer,
      new JsonRpcProvider(billionsMainnetConfig.url),
    );

    // Create Ethereum-based identity
    let did;
    try {
      const result = await identityWallet.createEthereumBasedIdentity({
        method: DidMethod.Iden3,
        blockchain: Blockchain.Billions,
        networkId: NetworkId.Main,
        seed: hexToBytes(privateKeyHex),
        revocationOpts: revocationOpts,
        ethSigner: wallet,
        createBjjCredential: false,
      });
      did = result.did;
    } catch (err) {
      throw new Error(
        `Failed to create Ethereum-based identity: ${err.message}`,
      );
    }

    // Save DID to storage
    await didsStorage.save({
      did: did.string(),
      publicKeyHex: signer.publicKey,
      isDefault: true,
    });

    outputSuccess(did.string());
  } catch (error) {
    outputError(error, true);
  }
}

main();
