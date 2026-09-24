const { FileStorage } = require("./base");

/**
 * Owner proof requests this agent sent, keyed by relay session id. The stored
 * authorization request is what the proof is verified against, so a proof is
 * only ever accepted for a request this agent created itself.
 */
class OwnerProofRequestsFileStorage extends FileStorage {
  constructor(filename = "ownerProofRequests.json") {
    super(filename);
  }

  async save(entry) {
    const entries = (await this.readFile()).filter(
      (e) => e.sessionId !== entry.sessionId,
    );
    entries.push(entry);
    await this.writeFile(entries);
  }

  async find(sessionId) {
    const entries = await this.readFile();
    return entries.find((e) => e.sessionId === sessionId);
  }
}

module.exports = { OwnerProofRequestsFileStorage };
