const { FileStorage } = require("./base");
const { getMasterKey, encryptKey, decryptKey } = require("./crypto");

/**
 * File-based storage for cryptographic keys.
 * Implements AbstractPrivateKeyStore interface from js-sdk.
 * Stores keys in JSON format as an array of per-entry versioned objects.
 */
class KeysFileStorage extends FileStorage {
  constructor(filename = "kms.json") {
    super(filename);
    // Holds raw on-disk entries that could not be decoded in this session
    // (e.g. encrypted entries when the master key env var is absent).
    // They are round-tripped untouched through writeFile so no data is lost.
    this._opaqueEntries = [];
  }

  _decodeEntry(entry) {
    // Legacy format
    if (Object.prototype.hasOwnProperty.call(entry, "privateKeyHex")) {
      return { alias: entry.alias, privateKeyHex: entry.privateKeyHex };
    }

    if (entry.version === 1) {
      const { alias, key } = entry.data;

      const { createdAt } = entry.data;

      if (entry.provider === "plain") {
        return { alias, privateKeyHex: key, createdAt };
      }

      if (entry.provider === "encrypted") {
        const masterKey = getMasterKey();
        if (!masterKey) {
          return { alias, _opaque: true, _raw: entry };
        }
        return { alias, privateKeyHex: decryptKey(key, masterKey), createdAt };
      }
    }

    throw new Error(
      `Unrecognised kms.json entry format: ${entry.alias || entry.data.alias || "unknown alias"}}`,
    );
  }

  _encodeEntry({ alias, privateKeyHex, createdAt }) {
    const masterKey = getMasterKey();
    if (masterKey) {
      return {
        version: 1,
        provider: "encrypted",
        data: { alias, key: encryptKey(privateKeyHex, masterKey), createdAt },
      };
    }
    return {
      version: 1,
      provider: "plain",
      data: { alias, key: privateKeyHex, createdAt },
    };
  }

  async readFile() {
    const raw = await super.readFile();
    if (!Array.isArray(raw)) {
      throw new Error("kms.json root must be an array");
    }
    const decoded = raw.map((entry) => this._decodeEntry(entry));
    // Stash raw on-disk objects for entries we cannot decode right now so
    // writeFile can round-trip them untouched.
    this._opaqueEntries = decoded.filter((e) => e._opaque).map((e) => e._raw);
    return decoded.filter((e) => !e._opaque);
  }

  async writeFile(keys) {
    const encoded = keys.map((entry) => this._encodeEntry(entry));
    await super.writeFile([...encoded, ...this._opaqueEntries]);
  }

  async importKey(args) {
    const keys = await this.readFile();
    const index = keys.findIndex((entry) => entry.alias === args.alias);

    if (index >= 0) {
      keys[index].privateKeyHex = args.key;
    } else {
      keys.push({
        alias: args.alias,
        privateKeyHex: args.key,
        createdAt: new Date().toISOString(),
      });
    }

    // update key under alias
    this._opaqueEntries = this._opaqueEntries.filter(
      (raw) => raw.data?.alias !== args.alias,
    );

    await this.writeFile(keys);
  }

  async get(args) {
    const keys = await this.readFile();
    const entry = keys.find((entry) => entry.alias === args.alias);
    return entry ? entry.privateKeyHex : "";
  }

  async list() {
    const keys = await this.readFile();
    return keys.map((entry) => ({
      alias: entry.alias,
      key: entry.privateKeyHex,
    }));
  }
}

module.exports = { KeysFileStorage };
