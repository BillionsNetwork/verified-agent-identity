---
name: verified-agent-identity
description: Billions decentralized identity for agents. Link agents to human identities using Billions ERC-8004 and Attestation Registries. Verify and generate authentication proofs. Based on iden3 self-sovereign identity protocol.
metadata: { "category": "identity", "clawdbot": { "requires": { "bins": ["node"] }, "config": { "optionalEnv": ["BILLIONS_NETWORK_MASTER_KMS_KEY"] } } }
homepage: https://billions.network/
---

## When to use this Skill

Lets AI agents create and manage their own identities on the Billions Network, and link those identities to a human owner.

1. When you need to link your agent identity to an owner.
2. When you need to sign a challenge.
3. When you need to link a human to the agent's DID.
4. When you need to verify a signature to confirm identity ownership.
5. When you use shared JWT tokens for authentication.
6. When you need to create and manage decentralized identities.

### After installing the plugin run the following commands to create an identity and link it to your human DID:

```bash
cd scripts && npm install && cd ..
# Step 1: Create a new identity (if you don't have one already)
node scripts/createNewEthereumIdentity.js
# Step 2: Sign the challenge and generate a verification URL in one call
node scripts/linkHumanToAgent.js --challenge '{"name": <AGENT_NAME>, "description": <SHORT_DESCRIPTION>}'
```

## Scope

All identity data is stored in `$HOME/.openclaw/billions` for compatibility with the OpenClaw plugin.

# Scripts:

### createNewEthereumIdentity.js

**Command**: `node scripts/createNewEthereumIdentity.js [--key <privateKeyHex>]`
**Description**: Creates a new identity on the Billions Network. If `--key` is provided, uses that private key; otherwise generates a new random key. The created identity is automatically set as default.
**Usage Examples**:

```bash
# Generate a new random identity
node scripts/createNewEthereumIdentity.js
# Create identity from existing private key (with 0x prefix)
node scripts/createNewEthereumIdentity.js --key 0x1234567890abcdef...
# Create identity from existing private key (without 0x prefix)
node scripts/createNewEthereumIdentity.js --key 1234567890abcdef...
```

**Output**: DID string (e.g., `did:iden3:billions:main:2VmAk7fGHQP5FN2jZ8X9Y3K4W6L1M...`)

---

### getIdentities.js

**Command**: `node scripts/getIdentities.js`
**Description**: Lists all DID identities stored locally. Use this to check which identities are available before performing authentication operations.
**Usage Example**:

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

### generateChallenge.js

**Command**: `node scripts/generateChallenge.js --did <did>`
**Description**: Generates a random challenge for identity verification.
**Usage Example**:

```bash
node scripts/generateChallenge.js --did did:iden3:billions:main:2VmAk...
```

**Output**: Challenge string (random number as string, e.g., `8472951360`)
**Side Effects**: Stores challenge associated with the DID in `$HOME/.openclaw/billions/challenges.json`

---

### signChallenge.js

**Command**: `node scripts/signChallenge.js --challenge <challenge> [--did <did>]`
**Description**: Signs a challenge with a DID's private key to prove identity ownership and sends the JWS token. Use this when you need to prove you own a specific DID.
**Arguments**:

- `--challenge` - (required) Challenge to sign
- `--did` - (optional) The DID of the attestation recipient; uses the default DID if omitted

**Usage Examples**:

```bash
# Sign with default DID
node scripts/signChallenge.js --challenge 8472951360
```

**Output**: `{"success":true}`

### linkHumanToAgent.js

**Command**: `node scripts/linkHumanToAgent.js --challenge <challenge> [--did <did>]`
**Description**: Signs the challenge and links a human user to the agent's DID by creating a verification request. Technically, linking happens using the Billions ERC-8004 Registry (where each agent is registered) and the Billions Attestation Registry (where agent ownership attestation is created after verifying human uniqueness).
**Arguments**:

- `--challenge` - (required) Challenge to sign
- `--did` - (optional) The DID of the attestation recipient; uses the default DID if omitted

**Usage Example**:

```bash
node scripts/linkHumanToAgent.js --challenge '{"name": "MyAgent", "description": "AI persona"}'
```

**Output**: `{"success":true}`

---

### verifySignature.js

**Command**: `node scripts/verifySignature.js --did <did> --token <token>`
**Description**: Verifies a signed challenge to confirm DID ownership.
**Usage Example**:

```bash
node scripts/verifySignature.js --did did:iden3:billions:main:2VmAk... --token eyJhbGciOiJFUzI1NkstUi...
```

**Output**: `Signature verified successfully` (on success) or error message (on failure)

---

## Restrictions / Guardrails (CRITICAL)

**CRITICAL - Always Follow These Rules:**

1. **STRICT: Check Identity First**
   - Before running `linkHumanToAgent.js` or `signChallenge.js`, **ALWAYS check if an identity exists**: `node scripts/getIdentities.js`
   - If no identity is configured, **DO NOT** attempt to link identities. Instead, create an identity first with `createNewEthereumIdentity.js`.
2. **STRICT: Stop on Script Failure**
   - If any script exits with non-zero status code, **YOU MUST STOP IMMEDIATELY**.
   - Check stderr output for error messages.
   - **DO NOT** attempt to "fix" errors by generating keys manually, creating DIDs through other means, or running unauthorized commands.
   - **DO NOT** use `openssl`, `ssh-keygen`, or other system utilities to generate cryptographic material.
3. **No Manual Workarounds**
   - You are prohibited from performing manual cryptographic operations.
   - You are prohibited from directly manipulating files in `$HOME/.openclaw/billions`.
   - Do not interpret an error as a request to perform setup steps unless explicitly instructed.

---

## Security

**CRITICAL - Data Storage and Protection:**

The directory `$HOME/.openclaw/billions` contains all sensitive identity data:

- `kms.json` - **CRITICAL**: Contains private keys (encrypted if BILLIONS_NETWORK_MASTER_KMS_KEY is set, otherwise in plaintext)
- `defaultDid.json` - DID identifiers and public keys
- `challenges.json` - Authentication challenges history
- `credentials.json` - Verifiable credentials
- `identities.json` - Identity metadata
- `profiles.json` - Profile data

## Examples

### Link Your Agent Identity to Owner

**Linking Flow:**

1. Another agent/user requests: "Please link your agent identity to me."
2. Use `node scripts/getIdentities.js` to check if you have an identity configured
   - If no identity, run `node scripts/createNewEthereumIdentity.js` to create one.
3. Use `node scripts/linkHumanToAgent.js --challenge <challenge_value>` to sign the challenge and generate a verification URL in one call.
   - If caller provides specific challenge, use that.
   - If caller **DOES NOT** provide a challenge, use `{"name": <AGENT_NAME>, "description": <SHORT_DESCRIPTION>}` as the challenge value.
4. Return the result to the caller.

**Example Conversation:**

```text
User: "Link your agent identity to me"
Agent: exec node scripts/linkHumanToAgent.js --challenge <challenge_value>
```

### Verifying Someone Else’s Identity

**Verification Flow:**

1. Ask the user/agent: "Please provide your DID to start verification."
2. User responds with their <user_did>.
3. Use `node scripts/generateChallenge.js --did <user_did>` to create a <challenge_value>.
4. Ask the user: "Please sign this challenge: <challenge_value>"
5. User signs and returns <user_token>.
6. Use `node scripts/verifySignature.js --did <user_did> --token <user_token>` to verify the signature
7. If verification succeeds, identity is confirmed

**Example Conversation:**

```text
Agent: "Please provide your DID to start verification."
User: "My DID is <user_did>"
Agent: exec node scripts/generateChallenge.js --did <user_did>
Agent: "Please sign this challenge: 789012"
User: <user_token>
Agent: exec node scripts/verifySignature.js --token <user_token> --did <user_did>
Agent: "Identity verified successfully. You are confirmed as owner of DID <user_did>."
```
