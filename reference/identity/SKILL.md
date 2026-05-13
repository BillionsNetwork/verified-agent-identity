# Identity Reference

Manage decentralized identities (DIDs) on the Billions Network — create, list, link to a human owner, and verify ownership.

## When to Use

- You need to create a new agent identity.
- You need to link your agent identity to a human owner.
- You need to sign a challenge to prove identity ownership.
- You need to verify someone else's identity.
- You need to list existing local identities.

## Scripts

### createNewEthereumIdentity.js

**Command**: `node scripts/createNewEthereumIdentity.js [--key <privateKeyHex>]`

Creates a new identity on the Billions Network. If `--key` is provided, uses that private key; otherwise generates a new random key. The created identity is automatically set as default.

```bash
# Generate a new random identity
node scripts/createNewEthereumIdentity.js

# Create identity from existing private key
node scripts/createNewEthereumIdentity.js --key 0x1234567890abcdef...
```

**Output**: DID string (e.g., `did:iden3:billions:main:2VmAk7fGHQP5FN2jZ8X9Y3K4W6L1M...`)

---

### getIdentities.js

**Command**: `node scripts/getIdentities.js`

Lists all DID identities stored locally. **Always run this before any signing or linking operation.**

```bash
node scripts/getIdentities.js
```

**Output**: JSON array of identity entries

```json
[
  {
    "did": "did:iden3:billions:main:2VmAk...",
    "publicKeyHex": "0x04abc123...",
    "isDefault": true
  }
]
```

---

### linkHumanToAgent.js

**Command**: `node scripts/linkHumanToAgent.js --challenge <challenge> [--did <did>]`

Signs the challenge and links a human user to the agent's DID by creating a verification request. Uses the Billions ERC-8004 Registry (agent registration) and the Billions Attestation Registry (ownership attestation after verifying human uniqueness).

- `--challenge` — (required) Challenge to sign. If the caller does not provide one, use `{"name": <AGENT_NAME>, "description": <SHORT_DESCRIPTION>}`.
- `--did` — (optional) Uses the default DID if omitted.

```bash
node scripts/linkHumanToAgent.js --challenge '{"name": "MyAgent", "description": "AI persona"}'
```

**Output**: `{"success":true}`

---

### generateChallenge.js

**Command**: `node scripts/generateChallenge.js --did <did>`

Generates a random challenge for identity verification. Stores the challenge in `$HOME/.openclaw/billions/challenges.json`.

```bash
node scripts/generateChallenge.js --did did:iden3:billions:main:2VmAk...
```

**Output**: Challenge string (e.g., `8472951360`)

---

### signChallenge.js

**Command**: `node scripts/signChallenge.js --challenge <challenge> [--did <did>]`

Signs a challenge with a DID's private key to prove identity ownership and sends the JWS token.

- `--challenge` — (required) Challenge to sign.
- `--did` — (optional) Uses the default DID if omitted.

```bash
node scripts/signChallenge.js --challenge 8472951360
```

**Output**: `{"success":true}`

---

### verifySignature.js

**Command**: `node scripts/verifySignature.js --did <did> --token <token>`

Verifies a signed challenge to confirm DID ownership.

```bash
node scripts/verifySignature.js --did did:iden3:billions:main:2VmAk... --token eyJhbGciOiJFUzI1NkstUi...
```

**Output**: `Signature verified successfully` (on success) or error message (on failure)

---

## Workflows

### Link Your Agent Identity to an Owner

1. Check for existing identity: `node scripts/getIdentities.js`
   - If none exists → `node scripts/createNewEthereumIdentity.js`
2. Run: `node scripts/linkHumanToAgent.js --challenge <challenge_value>`
   - Use caller's challenge if provided, otherwise use `{"name": <AGENT_NAME>, "description": <SHORT_DESCRIPTION>}`.
3. Return the result to the caller.

**Example Conversation:**

```
User: "Link your agent identity to me"
Agent: [runs getIdentities.js, confirms identity exists]
Agent: [runs linkHumanToAgent.js --challenge '{"name": "MyAgent", "description": "Coding assistant"}']
Agent: "Done — here's the verification link: ..."
```

### Verify Someone Else's Identity

1. Ask: "Please provide your DID to start verification."
2. Generate challenge: `node scripts/generateChallenge.js --did <user_did>`
3. Ask user to sign: "Please sign this challenge: `<challenge_value>`"
4. Verify: `node scripts/verifySignature.js --did <user_did> --token <user_token>`
5. Report result.

**Example Conversation:**

```
Agent: "Please provide your DID to start verification."
User: "My DID is did:iden3:billions:main:2VmAk..."
Agent: [runs generateChallenge.js] → "Please sign this challenge: 789012"
User: [provides token]
Agent: [runs verifySignature.js] → "Identity verified. You are confirmed as owner of that DID."
```
