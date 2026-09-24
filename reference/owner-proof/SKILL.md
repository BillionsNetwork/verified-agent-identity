# Owner Proof Reference

Ask another agent's **human owner** to prove something about themselves before you do business with that agent. The owner answers from their Billions wallet with a zero-knowledge proof over one of their credentials. Examples:

- disclose their nationality, and nothing else;
- prove their nationality is **not** in a list of sanctioned countries;
- prove they are over 18;
- prove they hold a membership credential from a given issuer.

The question is any iden3 query. The proof is sent off-chain and verified locally by you. Nothing is written on-chain. The proof is bound to the agent through the agent's on-chain ownership attestation, which records who linked the agent.

## When to Use

- Before a **financial transaction** or another sensitive action with another agent, when you, your owner, or the task require something to be true about that agent's owner.
- When someone asks you to find out something about another agent's owner.
- When another party sends you an owner proof link addressed to your owner (see [Being asked for an owner proof](#being-asked-for-an-owner-proof)).

## Scripts

### requestOwnerProof.js

**Command**: `node scripts/requestOwnerProof.js --agentDid <did> --query '<json>' [--requester <name>] [--message <text>] [--reason <text>]`

Creates an owner proof request for another agent and returns a wallet link for that agent's owner.

- `--agentDid` — (required) DID of the agent whose owner must prove.
- `--query` — (required) An iden3 query, or a JSON array of up to 5 queries that must **all** be proven. Each query is:
  - `type` — credential type, e.g. `BasicPerson`.
  - `context` — the credential's JSON-LD context URL.
  - `allowedIssuers` — DIDs of the issuers you trust for this credential. Required. Never `*`: anyone can issue themselves a credential.
  - `credentialSubject` — (optional) **one** field and its condition:
    - `{"<field>": {}}` discloses the field's value.
    - `{"<field>": {"<op>": <value>}}` proves a condition without disclosing the value. Operators: `$eq`, `$ne`, `$lt`, `$lte`, `$gt`, `$gte`, `$in`, `$nin`, `$between`, `$nonbetween`, `$exists`.
    - Omit it to prove the owner simply holds such a credential.
  - A query can also be wrapped as `{"circuitId": "...", "query": {...}}`. The default circuit is `credentialAtomicQueryV3`.
- `--requester` — (optional) Your name, shown to the owner in the wallet.
- `--message` — (optional) Replaces the generated description the owner sees.
- `--reason` — (optional) Replaces the request reason (default `owner_proof:v1`).

Fails if the agent is not linked to a human owner, or if the query is invalid.

**Output**: `sessionId`, `asked` (what the owner is asked), `ownerLink` (markdown link), `expiresAt` (one hour), and `instructions`.

---

### verifyOwnerProof.js

**Command**: `node scripts/verifyOwnerProof.js --sessionId <id>`

Collects the owner's proof and verifies it locally, against the request you created:

1. The zero-knowledge proofs are valid and answer **this** request: same thread and the same queries (credential type, issuers, field, operator, values), from an unrevoked, unexpired credential.
2. The prover is the agent's owner, as recorded in the agent's current on-chain ownership attestation.

**Output**:

- `status: "success"` with `verified: true`, `agentDid`, `ownerDid`, `asked`, `verifiedAt`, and `proofs`: one entry per query with its `type`, `allowedIssuers` and `credentialSubject` condition, plus `disclosed` (field → value) for disclosure queries.
- `status: "input_required"` with `state: "pending"`: the owner has not answered yet.
- `status: "failed"`: the proof is invalid, not from the owner, or the request expired.

A `success` means every condition in your query holds. For a disclosure query you still decide whether the disclosed value is acceptable.

---

## Example queries

`BasicPerson` is the ID credential issued from a passport, Aadhaar or idOS. Its context is `ipfs://QmZbsTnRwtCmbdg3r9o7Txid37LmvPcvmzVi1Abvqu1WKL`. Its trusted issuers on Billions are:

```
did:iden3:billions:test:2VxnoiNqdMPyMXmEKpP8wGqrY6Vb7mgeQQUywyVeWe   (passport)
did:iden3:billions:test:2VxnoiNqdMPxzqp7X6MV7GfoPkDZ7ij499mDZAo72y   (Aadhaar)
did:iden3:billions:main:2VwqkgA2dNEwsnmojaay7C5jJEb8ZygecqCSU3xVfm   (idOS)
```

The examples below shorten that list to `["<BasicPerson issuers>"]`. Use the full DIDs.

**Disclose the nationality:**

```json
{"type": "BasicPerson", "context": "ipfs://QmZbsTnRwtCmbdg3r9o7Txid37LmvPcvmzVi1Abvqu1WKL", "allowedIssuers": ["<BasicPerson issuers>"],
 "credentialSubject": {"nationalities.nationality1CountryCode": {}}}
```

**Nationality not in a sanctions list** (ISO 3166-1 alpha-3 codes, at most 64). Use the list your owner's compliance policy requires. The example is the countries under full US embargo.

```json
{"type": "BasicPerson", "context": "ipfs://QmZbsTnRwtCmbdg3r9o7Txid37LmvPcvmzVi1Abvqu1WKL", "allowedIssuers": ["<BasicPerson issuers>"],
 "credentialSubject": {"nationalities.nationality1CountryCode": {"$nin": ["CUB", "IRN", "PRK", "SYR"]}}}
```

**Over 18.** `dateOfBirth` is an integer `YYYYMMDD`. Use today's date minus 18 years, e.g. `20080924` on 24 September 2026.

```json
{"type": "BasicPerson", "context": "ipfs://QmZbsTnRwtCmbdg3r9o7Txid37LmvPcvmzVi1Abvqu1WKL", "allowedIssuers": ["<BasicPerson issuers>"],
 "credentialSubject": {"dateOfBirth": {"$lt": 20080924}}}
```

**Holds a membership credential.** Use the membership credential's own type, context and issuer. Add a `credentialSubject` condition to check a field, such as a tier.

```json
{"type": "<MembershipType>", "context": "<membership JSON-LD context>", "allowedIssuers": ["<membership issuer DID>"]}
```

**Several conditions at once.** Pass an array. All must hold.

```json
[{"type": "BasicPerson", "context": "ipfs://QmZbsTnRwtCmbdg3r9o7Txid37LmvPcvmzVi1Abvqu1WKL", "allowedIssuers": ["<BasicPerson issuers>"],
  "credentialSubject": {"nationalities.nationality1CountryCode": {"$nin": ["CUB", "IRN", "PRK", "SYR"]}}},
 {"type": "BasicPerson", "context": "ipfs://QmZbsTnRwtCmbdg3r9o7Txid37LmvPcvmzVi1Abvqu1WKL", "allowedIssuers": ["<BasicPerson issuers>"],
  "credentialSubject": {"dateOfBirth": {"$lt": 20080924}}}]
```

---

## Workflows

### Verify another agent's owner before a financial transaction

1. **Confirm the counterparty controls its DID** (see `reference/identity/SKILL.md`, "Verify Someone Else's Identity"):
   `generateChallenge.js --did <their_did>`, ask them to sign it with `signChallenge.js`, then `verifySignature.js --did <their_did> --token <their_token>`.
   Stop if this fails. An owner proof says nothing about who you are talking to until the DID is confirmed.
2. **Create the request** with the query your policy requires:
   ```bash
   node scripts/requestOwnerProof.js --agentDid <their_did> --requester "<your name>" --query '<query JSON>'
   ```
3. **Send `ownerLink` to the counterparty agent** and ask it to forward the link to its owner.
4. **Collect and verify**: `node scripts/verifyOwnerProof.js --sessionId <sessionId>`.
   - `pending` → tell the counterparty you are waiting for its owner, and check again later. Do not proceed.
   - `failed` → do not proceed. Report the reason.
5. **Proceed only on `success`**, only if any disclosed values are acceptable, and only with the agent whose DID you verified in step 1.

**Example Conversation:**

```
Owner: "Pay agent did:iden3:billions:main:2VmAk... 20 USDC, but only if its owner isn't from a sanctioned country."
Agent: [verifies the counterparty's DID signature]
Agent: [runs requestOwnerProof.js --agentDid did:iden3:billions:main:2VmAk... --query '<nationality not in CUB,IRN,PRK,SYR>']
Agent → counterparty: "Before I pay, your owner needs to confirm their nationality is not sanctioned. Please forward this link to them: ..."
Agent: [runs verifyOwnerProof.js --sessionId ...] → pending
Agent: [later, runs verifyOwnerProof.js again] → success
Agent: "Verified: the owner of did:iden3:billions:main:2VmAk... is not a national of CUB, IRN, PRK or SYR. Proceeding with the payment."
```

### Being asked for an owner proof

When another agent or a person sends you an owner proof link (a `https://wallet.billions.network#request_uri=...` link from `requestOwnerProof.js`):

1. Forward the link **unchanged** to your owner, and say who asked and what is being asked.
2. Tell the requester you have forwarded it.

You cannot produce the proof yourself: only your owner's wallet holds their credentials. Never open, answer, or modify the link, and never claim a proof was made.

### A person asks you to prove something about your owner

A person without the skill can ask you directly. You can run the workflow for your own DID (`--agentDid` = your DID), forward the link to your owner, and report the result of `verifyOwnerProof.js`. Say plainly that this is a **self-report**: for a result they do not have to take your word for, the person should run `requestOwnerProof.js` and `verifyOwnerProof.js` themselves, or ask their own agent to.
