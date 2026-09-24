# Owner Proof Reference

Check who stands behind another agent before doing business with it. The other agent's **human owner** proves, in zero knowledge from their Billions wallet, either:

- **their nationality** (only the nationality is disclosed), or
- **that their nationality is not in a list of sanctioned countries** (nothing is disclosed).

The proof is sent off-chain and verified locally by you. Nothing about nationality is written on-chain. The proof is bound to the agent through the agent's on-chain ownership attestation, which records who linked the agent.

## When to Use

- Before a **financial transaction** with another agent, when you, your owner, or the task requires knowing the counterparty's owner is not from a sanctioned country.
- When someone asks you to find out the nationality of another agent's owner.
- When another party sends you an owner proof link addressed to your owner (see [Being asked for an owner proof](#being-asked-for-an-owner-proof)).

## Scripts

### requestOwnerProof.js

**Command**: `node scripts/requestOwnerProof.js --agentDid <did> --proof <nationality|notSanctioned> [--countries <codes>] [--allowedIssuers <dids>] [--requester <name>]`

Creates an owner proof request for another agent and returns a wallet link for that agent's owner.

- `--agentDid` — (required) DID of the agent whose owner must prove.
- `--proof` — (required) `nationality` to disclose the nationality, or `notSanctioned` to prove it is not in `--countries`.
- `--countries` — (optional, `notSanctioned` only) Comma-separated ISO 3166-1 alpha-3 codes, at most 64. Defaults to `CUB,IRN,PRK,SYR`. Use the list your owner's compliance policy requires.
- `--allowedIssuers` — (optional) Comma-separated DIDs of issuers whose ID credential is accepted. Defaults to the Billions passport and Aadhaar issuers and idOS. Never pass `*`.
- `--requester` — (optional) Your name, shown to the owner in the wallet.

Fails if the agent is not linked to a human owner.

**Output**: `sessionId`, `ownerLink` (markdown link), `expiresAt` (one hour), and `instructions`.

---

### verifyOwnerProof.js

**Command**: `node scripts/verifyOwnerProof.js --sessionId <id>`

Collects the owner's proof and verifies it locally. Every check runs on your side against the request you created:

1. The zero-knowledge proofs are valid and answer **this** request: same thread, same query, same country list, an allowed issuer, and an unrevoked, unexpired credential.
2. The prover is the agent's owner, as recorded in the agent's current on-chain ownership attestation.

**Output**:

- `status: "success"` with `verified: true`, `financialTransactionsAllowed: true`, `agentDid`, `ownerDid`, `verifiedAt`, and either `nationality` (e.g. `"ARE"`) or `notNationalOf` (the country list).
- `status: "input_required"` with `state: "pending"`: the owner has not answered yet.
- `status: "failed"`: the proof is invalid, not from the owner, or the request expired.

---

## Workflows

### Verify another agent's owner before a financial transaction

1. **Confirm the counterparty controls its DID** (see `reference/identity/SKILL.md`, "Verify Someone Else's Identity"):
   `generateChallenge.js --did <their_did>`, ask them to sign it with `signChallenge.js`, then `verifySignature.js --did <their_did> --token <their_token>`.
   Stop if this fails. An owner proof says nothing about who you are talking to until the DID is confirmed.
2. **Create the request**:
   ```bash
   node scripts/requestOwnerProof.js --agentDid <their_did> --proof notSanctioned --requester "<your name>"
   ```
3. **Send `ownerLink` to the counterparty agent** and ask it to forward the link to its owner.
4. **Collect and verify**: `node scripts/verifyOwnerProof.js --sessionId <sessionId>`.
   - `pending` → tell the counterparty you are waiting for its owner, and check again later. Do not proceed.
   - `failed` → do not proceed. Report the reason.
5. **Proceed only on `success` with `financialTransactionsAllowed: true`**, and only with the agent whose DID you verified in step 1.

**Example Conversation:**

```
Owner: "Pay agent did:iden3:billions:main:2VmAk... 20 USDC, but only if its owner isn't from a sanctioned country."
Agent: [verifies the counterparty's DID signature]
Agent: [runs requestOwnerProof.js --agentDid did:iden3:billions:main:2VmAk... --proof notSanctioned]
Agent → counterparty: "Before I pay, your owner needs to confirm their nationality is not sanctioned. Please forward this link to them: ..."
Agent: [runs verifyOwnerProof.js --sessionId ...] → pending
Agent: [later, runs verifyOwnerProof.js again] → success
Agent: "Verified: the owner of did:iden3:billions:main:2VmAk... is not a national of CUB, IRN, PRK or SYR. Proceeding with the payment."
```

### Being asked for an owner proof

When another agent or a person sends you an owner proof link (a `https://wallet.billions.network#request_uri=...` link from `requestOwnerProof.js`):

1. Forward the link **unchanged** to your owner, and say who asked and what is being asked (nationality disclosure, or not being from a list of countries).
2. Tell the requester you have forwarded it.

You cannot produce the proof yourself: only your owner's wallet holds their ID credential. Never open, answer, or modify the link, and never claim a proof was made.

### A person asks you to prove your owner is not sanctioned

A person without the skill can ask you directly. You can run the workflow for your own DID (`--agentDid` = your DID), forward the link to your owner, and report the result of `verifyOwnerProof.js`. Say plainly that this is a **self-report**: for a result they do not have to take your word for, the person should run `requestOwnerProof.js` and `verifyOwnerProof.js` themselves, or ask their own agent to.
