const {
  parseArgs,
  hashstr,
  outputSuccess,
  outputError,
  outputInputRequired,
  getUserWallet,
  createAuthRequestMessage,
  getRequiredDidEntry,
} = require("./shared/utils");
const { getInitializedRuntime } = require("./shared/bootstrap");
const { x402Client } = require("@x402/core/client");
const { ExactEvmScheme } = require("@x402/evm/exact/client");
const {
  createHumanProofExtension,
  MissingAttestationsError,
  checkAttestation,
  isMaxUseExceededError,
} = require("@privadoid/x402-human-proof-client/packages/client");
const { toClientEvmSigner } = require("@x402/evm");
const {
  schemaId,
  transactionSender,
  requiredAttestationsMessage,
} = require("./shared/constants");
const { createPOUScope, createAuthScope } = require("./shared/scopes");
const { signChallenge } = require("./signChallenge");
const { v4: uuidv4 } = require("uuid");

function getPaymentHash(payment) {
  return hashstr(JSON.stringify(payment));
}

function getRequiredAttestations(payment) {
  return (payment.extra && payment.extra.requiredAttestations) || [];
}

async function getMissingAttestations(did, payment) {
  const requiredAttestations = getRequiredAttestations(payment);
  const results = await Promise.all(
    requiredAttestations.map(async (id) => ({
      id,
      exists: await checkAttestation(did, id),
    })),
  );
  return results.filter((r) => !r.exists).map((r) => r.id);
}

async function createAttestationLinks(
  attestationSchemaIds,
  transactionSenderAddr,
  did,
  entry,
  kms,
) {
  return await Promise.all(
    attestationSchemaIds.map(async (attestationSchemaId) => {
      if (attestationSchemaId !== schemaId) {
        throw new Error(
          `Unknown attestation requirement with schema ${attestationSchemaId}`,
        );
      }
      const scope = [
        createPOUScope(transactionSenderAddr),
        createAuthScope(did),
      ];
      const signedChallenge = await signChallenge(
        { name: uuidv4(), description: uuidv4() },
        entry,
        kms,
      );
      return await createAuthRequestMessage(signedChallenge, scope);
    }),
  );
}

async function handleMissingAttestations(error, entry, kms) {
  const attestationLinks = await createAttestationLinks(
    error.attestationRequirements,
    transactionSender,
    entry.did,
    entry,
    kms,
  );
  outputInputRequired(
    {
      attestationsRequired: true,
      message: requiredAttestationsMessage,
      attestationLinks,
    },
    true,
  );
}

async function buildPaymentInfo(payment, entry, kms) {
  const requiredAttestations = getRequiredAttestations(payment);
  const missingAttestations = await getMissingAttestations(entry.did, payment);

  let attestationLinks = [];
  if (missingAttestations.length > 0) {
    attestationLinks = await createAttestationLinks(
      missingAttestations,
      transactionSender,
      entry.did,
      entry,
      kms,
    );
  }

  return {
    hash: getPaymentHash(payment),
    amount: payment.amount,
    asset: (payment.extra && payment.extra.name) || payment.asset,
    network: payment.network,
    requiredAttestations,
    hasAllAttestations: missingAttestations.length === 0,
    attestationLinks,
  };
}

async function main() {
  try {
    const args = parseArgs();

    if (!args.paymentRequired) {
      outputError("--paymentRequired is required", true);
    }

    let paymentRequired;
    try {
      paymentRequired = args.paymentRequired.trim().startsWith("{")
        ? JSON.parse(args.paymentRequired)
        : JSON.parse(atob(args.paymentRequired));
    } catch (e) {
      outputError(
        "--paymentRequired must be valid JSON or Base64 encoded JSON",
        true,
      );
    }

    const { kms, memoryKeyStore, didsStorage } = await getInitializedRuntime();
    const entry = await getRequiredDidEntry(didsStorage, args.did);

    const payments = paymentRequired.accepts;

    // Phase 1: Multiple payments — show selection to user
    if (payments.length > 1 && !args.paymentHash) {
      const paymentInfos = await Promise.all(
        payments.map((p) => buildPaymentInfo(p, entry, kms)),
      );
      outputInputRequired(
        { multiplePayments: true, payments: paymentInfos },
        true,
      );
      return;
    }

    // Phase 2: User selected a payment by hash - filter to it
    if (args.paymentHash) {
      const matched = payments.find(
        (p) => getPaymentHash(p) === args.paymentHash,
      );
      if (!matched) {
        outputError("No payment matching the provided --paymentHash", true);
        return;
      }
      paymentRequired.accepts = [matched];
    }

    // Phase 3: Single payment - check attestations before proceeding
    const selectedPayment = paymentRequired.accepts[0];
    const missingAttestations = await getMissingAttestations(
      entry.did,
      selectedPayment,
    );

    if (missingAttestations.length > 0) {
      const attestationLinks = await createAttestationLinks(
        missingAttestations,
        transactionSender,
        entry.did,
        entry,
        kms,
      );
      outputInputRequired(
        {
          attestationsRequired: true,
          message: requiredAttestationsMessage,
          attestationLinks,
        },
        true,
      );
      return;
    }

    // Phase 4: Execute payment and fetch the resource
    const { wallet } = await getUserWallet(entry, memoryKeyStore);
    const signer = toClientEvmSigner(wallet);

    const x402 = new x402Client();
    x402.register("eip155:*", new ExactEvmScheme(signer));
    x402.registerExtension(
      createHumanProofExtension({
        address: wallet.address,
        pubKey: wallet.publicKey,
        signMessage: (msg) => wallet.signMessage({ message: msg }),
      }),
    );
    x402.onPaymentCreationFailure(async ({ error }) => {
      if (error instanceof MissingAttestationsError) {
        await handleMissingAttestations(error, entry, kms);
      }
    });

    let paymentPayload;
    try {
      paymentPayload = await x402.createPaymentPayload(paymentRequired);
    } catch (error) {
      if (error instanceof MissingAttestationsError) {
        return;
      } else {
        throw error;
      }
    }

    // Phase 5: Fetch the resource with the payment signature
    const paymentSignature = btoa(JSON.stringify(paymentPayload));
    const url = paymentRequired.resource.url;
    let response;
    response = await fetch(url, {
      headers: { "PAYMENT-SIGNATURE": paymentSignature },
    });

    if (response.status === 402) {
      console.log(response);
      if (isMaxUseExceededError({ response })) {
        outputInputRequired(
          {
            maxUseExceeded: true,
            message:
              "Payment has exceeded its maximum allowed uses. Choose a different payment or contact the resource provider.",
          },
          true,
        );
      }
      // if not max use exceeded, check for new payment required
      const newPaymentRequired = response.headers.get("payment-required");
      if (newPaymentRequired) {
        outputInputRequired({ newPaymentRequired: newPaymentRequired }, true);
        return;
      }
      outputError("Received 402 but no PAYMENT-REQUIRED header found", true);
      return;
    }

    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }

    if (response.ok) {
      outputSuccess(responseBody, true);
    } else {
      outputError(
        `HTTP ${response.status}: ${typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)}`,
        true,
      );
    }
  } catch (error) {
    outputError(error, true);
  }
}

main();
