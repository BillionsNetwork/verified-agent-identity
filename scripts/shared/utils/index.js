const cli = require("./cli");
const did = require("./did");
const auth = require("./auth");
const { createHash } = require("crypto");

/**
 * Removes the "0x" prefix from a hexadecimal string if it exists
 */
function normalizeKey(keyId) {
  return keyId.startsWith("0x") ? keyId.slice(2) : keyId;
}

/**
 * Add hex prefix if missing
 */
function addHexPrefix(keyId) {
  return keyId.startsWith("0x") ? keyId : `0x${keyId}`;
}

/**
 * Retrieves a DID entry from storage, throwing if not found.
 * @param {object} didsStorage - The DID storage instance.
 * @param {string} [didOverride] - Optional specific DID to look up instead of the default.
 * @returns {Promise<object>} The DID entry.
 */
async function getRequiredDidEntry(didsStorage, didOverride) {
  const entry = didOverride
    ? await didsStorage.find(didOverride)
    : await didsStorage.getDefault();

  if (!entry) {
    const errorMsg = didOverride
      ? `No DID ${didOverride} found`
      : "No default DID found";
    throw new Error(errorMsg);
  }

  return entry;
}

function hashstr(str) {
  return createHash("sha256").update(str).digest("hex");
}

module.exports = {
  // Generic helpers
  normalizeKey,
  addHexPrefix,
  getRequiredDidEntry,
  hashstr,
  ...cli,
  ...did,
  ...auth,
};
