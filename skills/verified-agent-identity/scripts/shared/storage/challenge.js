const { FileStorage } = require("./base");

class ChallengeFileStorage extends FileStorage {
  constructor(filename = "challenges.json") {
    super(filename);
  }

  async save(did, challenge) {
    const entries = await this.readFile();
    const created_at = new Date();

    const index = entries.findIndex((entry) => entry.did === did);

    if (index >= 0) {
      // Update existing entry
      entries[index] = { did, challenge, created_at };
    } else {
      // Add new entry
      entries.push({ did, challenge, created_at });
    }

    await this.writeFile(entries);
  }

  async find(did) {
    const entries = await this.readFile();
    return entries.find((entry) => entry.did === did);
  }

  async getChallenge(did) {
    const entry = await this.find(did);
    return entry?.challenge;
  }

  async list() {
    return this.readFile();
  }

  async delete(did) {
    const entries = await this.readFile();
    const initialLength = entries.length;
    const filtered = entries.filter((entry) => entry.did !== did);

    if (filtered.length < initialLength) {
      await this.writeFile(filtered);
      return true;
    }

    return false;
  }
}

module.exports = { ChallengeFileStorage };
