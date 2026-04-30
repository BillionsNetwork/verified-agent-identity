const { FileStorage } = require("./base");

/**
 * DidsFileStorage manages DID entries with default DID support
 */
class DidsFileStorage extends FileStorage {
  constructor(filename = "defaultDid.json") {
    super(filename);
  }

  async save({ did, publicKeyHex, isDefault = false }) {
    const entries = await this.readFile();

    // If setting this as default, unset all other defaults
    if (isDefault) {
      entries.forEach((entry) => {
        entry.isDefault = false;
      });
    }

    const index = entries.findIndex((entry) => entry.did === did);

    if (index >= 0) {
      entries[index] = { did, publicKeyHex, isDefault };
    } else {
      entries.push({ did, publicKeyHex, isDefault });
    }

    await this.writeFile(entries);
  }

  async find(did) {
    const entries = await this.readFile();
    return entries.find((entry) => entry.did === did);
  }

  async getDefault() {
    const entries = await this.readFile();
    return entries.find((entry) => entry.isDefault);
  }

  async list() {
    return this.readFile();
  }
}

module.exports = { DidsFileStorage };
