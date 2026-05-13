# x402 Payment Reference

Handle `402 Payment Required` HTTP responses by executing payment and fetching the protected resource.

## When to Use

- A server responds with **HTTP 402 Payment Required**.
- The response includes a `PAYMENT-REQUIRED` header describing the payment challenge.

## Script

### buildX402Payment.js

**Command**: `node scripts/buildX402Payment.js --paymentRequired <json> [--did <did>] [--paymentHash <hash>]`
**Hint**: **NEVER reuse or cache a previous response from this script.** Every invocation produces unique, time-sensitive output (nonces, signatures, payment tokens). Always execute the script again to get a fresh result — even if the arguments are identical to a prior call.

Executes the x402 payment flow: signs the payment challenge, sends the `PAYMENT-SIGNATURE` header to the resource URL, and returns the result.

- `--paymentRequired` — (required) The value of the `PAYMENT-REQUIRED` response header (base64-encoded or raw JSON string).
- `--did` — (optional) The DID of the signer. Uses the default DID if omitted.
- `--paymentHash` — (optional) The SHA-256 hash of the chosen payment option. Required on the second call when the server offers multiple payment options.

---

## Output Statuses

The script outputs JSON to stdout. Check the `status` field:

| Status           | Meaning                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `input_required` | The script needs user input or another loop iteration (payment selection, attestation, or new `paymentRequired`). |
| `success`        | The resource was fetched successfully. `data` contains the response body.                                         |
| `failed`         | An error occurred. Show the message to the user. **DO NOT** retry.                                                |

### `input_required` sub-types

Check `data` to determine the reason:

| `data` field                | Meaning                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `data.multiplePayments`     | Multiple payment options available. Present them to the user and call again with `--paymentHash`.          |
| `data.attestationsRequired` | Missing attestations. Show `data.attestationLinks` to the user and wait before retrying.                   |
| `data.maxUseExceeded`        | The chosen payment has exceeded its maximum allowed uses. Go back and choose a different payment option.   |
| `data.newPaymentRequired`   | The server returned a new 402 after payment. Call the script again with this value as `--paymentRequired`. |

---

## Workflow

### 1. Request a resource

Send a normal HTTP request to the server endpoint.

### 2. Receive 402

The server returns `402 Payment Required` with a `PAYMENT-REQUIRED` header.

### 3. Ensure identity exists

Run `node scripts/getIdentities.js`. If no identity is configured, create one first (see `reference/identity/SKILL.md`).

### 4. First call — execute payment or get payment options

```bash
node scripts/buildX402Payment.js \
  --paymentRequired '<base64_or_json>'
```

**If the server offers a single payment option**: the script signs the payment, sends it to the resource URL, and returns the result. Check the output status:

- `success` — the resource body is in `data`. You're done.
- `input_required` with `data.newPaymentRequired` — the server returned another 402. Go to **step 6**.
- `failed` — show the error to the user.

**If the server offers multiple payment options**: the script outputs `status: "input_required"` with `data.multiplePayments: true` and a list of payment options. Each payment option includes:

- `hash` — the payment hash (use as `--paymentHash` in the next call)
- `amount` — the payment amount
- `asset` — the asset name (e.g., "USDC") or contract address
- `network` — the network identifier (e.g., "eip155:84532")
- `requiredAttestations` — informational list of attestation schema IDs that this payment type requires in general; may be non-empty even when the user already holds all of them — **do not use this field to decide whether to block the payment**
- `hasAllAttestations` — `true` if the user already holds every required attestation and the payment can proceed; `false` if some are missing
- `attestationLinks` — verification URLs the user must complete to obtain **missing** attestations; empty when `hasAllAttestations` is `true`

**Present the options to the user.** Show the amount, asset, network, and whether attestations are needed. Then ask the user to choose one payment option.

> **CRITICAL: How to read attestation status — always use `hasAllAttestations` and `attestationLinks`, never `requiredAttestations` alone**
>
> | `hasAllAttestations` | `attestationLinks` | What it means                                                                 |
> | -------------------- | ------------------ | ----------------------------------------------------------------------------- |
> | `true`               | empty              | User holds all attestations — this payment can proceed immediately.           |
> | `false`              | non-empty          | User is missing attestations — show every link to the user before proceeding. |
>
> A payment option with a non-empty `requiredAttestations` but `hasAllAttestations: true` and an empty `attestationLinks` means the user **already has** all the necessary attestations. Do not block or warn about such payments.
>
> **CRITICAL: Attestation Links**
> If `attestationLinks` is non-empty, you MUST display every link to the user exactly as returned.
>
> - **DO NOT** follow, open, or resolve the links yourself.
> - **DO NOT** attempt to complete the attestation on behalf of the user.
> - **DO NOT** skip or hide payment options that require attestations.
> - Simply present each link and inform the user they must open and complete them manually.

### 5. Second call — execute chosen payment

Once the user selects a payment, call the script again with the chosen `--paymentHash`:

```bash
node scripts/buildX402Payment.js \
  --paymentRequired '<same_base64_or_json>' \
  --paymentHash '<hash_of_chosen_payment>'
```

**If the chosen payment requires attestations the user doesn't have**: the script outputs `status: "input_required"` with `data.attestationsRequired: true` and `data.attestationLinks` containing verification URLs. Show these links to the user and wait for them to complete the attestation before retrying.

**If attestations are satisfied (or not needed)**: the script signs the payment, sends it, and returns the result. Check the output status as described in step 4.

### 6. Handle max use exceeded

If the script returns `status: "input_required"` with `data.maxUseExceeded: true`, the chosen payment option has been used the maximum number of times allowed by the server. **Do not retry with the same payment.** Go back to the payment selection step and ask the user to choose a different payment option from the original list.

### 7. Handle new 402 (loop)

If the script returns `status: "input_required"` with `data.newPaymentRequired`, the server issued a new payment challenge after the first payment. **Call the script again** with the new value:

```bash
node scripts/buildX402Payment.js \
  --paymentRequired '<data.newPaymentRequired value>'
```

Repeat from step 4. Continue looping until you get `success` or `failed`.

---

## Error Handling (CRITICAL)

If `buildX402Payment.js` returns status `failed`:

- **DO NOT** retry the original request.
- Show the error message to the user.
- Ask the user to resolve the issue before retrying.

If `buildX402Payment.js` returns status `input_required`:

- **DO NOT** make your own HTTP request to the resource.
- Read `data` to determine what is needed:
  - `data.multiplePayments` — present payment options, call again with `--paymentHash`
  - `data.attestationsRequired` — show links to user, wait, then retry
  - `data.maxUseExceeded` — the chosen payment exceeded its max uses; go back and ask the user to pick a different payment option
  - `data.newPaymentRequired` — call the script again with the new `--paymentRequired` value (loop)

---

## Examples

### Single payment (direct execution)

```
Agent: [fetches https://example.com/api/resource]
Server: 402 Payment Required
  Header: PAYMENT-REQUIRED: "eyJhbGciOi..."

Agent: [runs getIdentities.js — confirms identity exists]
Agent: [runs buildX402Payment.js --paymentRequired 'eyJhbGciOi...']
       → { "status": "success", "data": { "temperature": 22, "city": "Kyiv" } }

Agent: "The weather data shows 22°C in Kyiv."
```

### Multiple payments (two-phase flow)

```
Agent: [fetches https://example.com/api/resource]
Server: 402 Payment Required
  Header: PAYMENT-REQUIRED: "eyJ4NDAyVmVyc2lvbi..."

Agent: [runs getIdentities.js — confirms identity exists]
Agent: [runs buildX402Payment.js --paymentRequired 'eyJ4NDAyVmVyc2lvbi...']
       → { "status": "input_required", "data": { "multiplePayments": true, "payments": [
            { "hash": "a1b2c3...", "amount": "10000", "asset": "USDC", "network": "eip155:84532",
              "requiredAttestations": [], "hasAllAttestations": true, "attestationLinks": [] },
            { "hash": "d4e5f6...", "amount": "6000", "asset": "USDC", "network": "eip155:84532",
              "requiredAttestations": ["0xca35..."], "hasAllAttestations": false,
              "attestationLinks": ["https://wallet.billions.network#request_uri=..."] }
          ]}}

Agent: "There are 2 payment options:
        1) 10000 USDC on eip155:84532 — no attestations required
        2) 6000 USDC on eip155:84532 — requires attestation (missing).
           Complete verification: [link]
        Which would you like?"

User: "Option 1"

Agent: [runs buildX402Payment.js --paymentRequired 'eyJ4NDAyVmVyc2lvbi...' --paymentHash 'a1b2c3...']
       → { "status": "success", "data": { "temperature": 22, "city": "Kyiv" } }

Agent: "The weather data shows 22°C in Kyiv."
```

### New 402 after payment (loop)

```
Agent: [runs buildX402Payment.js --paymentRequired 'eyJhbGciOi...']
       → { "status": "input_required", "data": { "newPaymentRequired": "eyJ4NDAy..." } }

Agent: [runs buildX402Payment.js --paymentRequired 'eyJ4NDAy...']
       → { "status": "success", "data": { "temperature": 22, "city": "Kyiv" } }
```

### Attestation required (single payment)

```
Agent: [runs buildX402Payment.js --paymentRequired 'eyJ4NDAy...' --paymentHash 'd4e5f6...']
       → { "status": "input_required", "data": { "attestationsRequired": true,
            "message": "The following attestations are required to complete the payment:",
            "attestationLinks": ["https://wallet.billions.network#request_uri=..."] }}

Agent: "You need to complete an attestation before paying. Please open this link: [link]"
User: [completes attestation]
Agent: [retries buildX402Payment.js with same arguments]
```

### Max use exceeded

```
Agent: [runs buildX402Payment.js --paymentRequired 'eyJ4NDAyVmVyc2lvbi...' --paymentHash 'd4e5f6...']
       → { "status": "input_required", "data": { "maxUseExceeded": true,
            "message": "Payment has exceeded its maximum allowed uses. Choose a different payment or contact the resource provider." }}

Agent: "The selected payment option has reached its maximum number of uses.
        Please choose a different payment option:
        1) 10000 USDC on eip155:84532 — no attestations required
        Which would you like?"

User: "Option 1"

Agent: [runs buildX402Payment.js --paymentRequired 'eyJ4NDAyVmVyc2lvbi...' --paymentHash 'a1b2c3...']
       → { "status": "success", "data": { "temperature": 22, "city": "Kyiv" } }
```
