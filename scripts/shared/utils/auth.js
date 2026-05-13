const { auth } = require("@iden3/js-iden3-auth");
const { keyPath, KmsKeyType } = require("@0xpolygonid/js-sdk");
const { v7: uuid } = require("uuid");
const { secp256k1 } = require("@noble/curves/secp256k1");
const { privateKeyToAccount } = require("viem/accounts");
const {
  callbackBase,
  pairingReasonMessage,
  verificationMessage,
  verifierDid,
  walletAddress,
  accept,
  urlShortener,
} = require("../constants");

/**
 * Wraps fetch() with an AbortController timeout.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Creates an Authorization Response Message for challenge signing
 */
function getAuthResponseMessage(did, challenge) {
  const { PROTOCOL_CONSTANTS } = require("@0xpolygonid/js-sdk");
  return {
    id: uuid(),
    thid: uuid(),
    from: did,
    to: "",
    type: PROTOCOL_CONSTANTS.PROTOCOL_MESSAGE_TYPE
      .AUTHORIZATION_RESPONSE_MESSAGE_TYPE,
    body: {
      message: challenge,
      scope: [],
    },
  };
}

/**
 * Derives the ethers Wallet for a DID entry.
 * No provider needed — message signing is a local operation.
 */
async function getUserWallet(entry, kms) {
  const { normalizeKey, addHexPrefix } = require("./index");

  const compressedPublicKey = secp256k1.Point.fromHex(
    normalizeKey(entry.publicKeyHex),
  ).toHex(true);

  const alias = keyPath(KmsKeyType.Secp256k1, compressedPublicKey);
  const privateKeyHex = await kms.get({ alias });
  if (!privateKeyHex) {
    throw new Error(`No private key found for the DID ${entry.did}`);
  }

  const wallet = privateKeyToAccount(addHexPrefix(privateKeyHex));

  return { wallet };
}

async function createAuthRequestMessage(jws, scope) {
  const callback = callbackBase + jws;

  const message = auth.createAuthorizationRequestWithMessage(
    pairingReasonMessage,
    verificationMessage,
    verifierDid,
    encodeURI(callback),
    {
      scope: scope,
      accept: accept,
    },
  );

  const shortenerResponse = await fetchWithTimeout(
    `${urlShortener}/shortener`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    },
  );

  if (shortenerResponse.status !== 201) {
    throw new Error(
      `URL shortener failed with status ${shortenerResponse.status}`,
    );
  }

  const { url } = await shortenerResponse.json();

  return `${walletAddress}#request_uri=${url}`;
}

module.exports = {
  fetchWithTimeout,
  getAuthResponseMessage,
  getUserWallet,
  createAuthRequestMessage,
};
