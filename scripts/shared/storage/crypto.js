"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getMasterKey() {
  const rawKey = process.env.BILLIONS_NETWORK_MASTER_KMS_KEY;

  if (typeof rawKey !== "string") {
    return null;
  }

  const trimmedKey = rawKey.trim();

  // Reject whitespace-only or too-short keys to avoid weak/blank-looking master keys.
  // Returning null keeps behavior consistent with the "no key configured" case.
  const MIN_MASTER_KEY_LENGTH = 16;
  if (trimmedKey.length < MIN_MASTER_KEY_LENGTH) {
    return null;
  }

  return trimmedKey;
}

function deriveAesKey(masterKeyString) {
  return crypto.createHash("sha256").update(masterKeyString, "utf8").digest();
}

function encryptKey(keyHex, masterKeyString) {
  const aesKey = deriveAesKey(masterKeyString);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, aesKey, iv, {
    authTagLength: TAG_BYTES,
  });

  const encrypted = Buffer.concat([
    cipher.update(keyHex, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

function decryptKey(encryptedPayload, masterKeyString) {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key format in kms.json");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;

  const aesKey = deriveAesKey(masterKeyString);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, aesKey, iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "kms.json decryption failed: wrong BILLIONS_NETWORK_MASTER_KMS_KEY or file has been tampered with",
    );
  }
}

module.exports = { getMasterKey, encryptKey, decryptKey };
