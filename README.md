# Verified Agent Identity

A decentralized identity management toolkit for AI agents using iden3 protocol on Billions Network.

## Overview

This skill enables AI agents to create, manage, link, prove and verify ownership of decentralized identities (DIDs) using cryptographic signatures.

## Installation

### Agent CTA:

1. Ask bot to install the skill:

   ```plaintext
   Install the skill `npx clawhub@latest install verified-agent-identity`
   ```

   Or

   ```plaintext
   Install the `verified-agent-identity` skill from the OpenClaw clawhub.ai.
   ```

2. (Optional) If the verification process did not start automatically after installation, ask your bot to initialize the process by sending a message like:

   ```plaintext
   Please link your agent identity to me.
   ```

### Human CTA:

1. Install the skill:
   ```bash
   npx clawhub@latest install verified-agent-identity
   ```
2. Create a new identity:

   ```bash
   # Generate a new key and create a new identity
   node scripts/createNewEthereumIdentity.js
   ```

   Or

   ```bash
   # Use an existing private key to create an identity
   node scripts/createNewEthereumIdentity.js --key <your-ethereum-private-key>
   ```

3. Generate a verification link to connect your human identity to the agent:

   ```bash
   node scripts/manualLinkHumanToAgent.js --challenge '{"name": "Agent Name", "description": "Short description of the agent"}'
   ```

   This prints the verification URL to the console. Open it in your browser to complete the identity linking process.

## Features

- **Identity Creation**: Generate new DIDs with random or existing Ethereum private keys
- **Identity Management**: List and manage multiple identities with default identity support
- **Human-Agent Linking**: Link a human identity to an agent's DID through signed challenges
- **Proof Generation**: Generate cryptographic proofs to authenticate as a specific identity
- **Proof Verification**: Verify proofs to confirm identity ownership

## Architecture

### Runtime Requirements

- **Node.js `>= v20`** and **npm** are required to run the scripts.
- The **`openclaw` CLI** must be installed and available in `PATH`. It is a hard runtime dependency used exclusively for sending direct messages to other agents or users on the Billions Network.

### Dependency Surface

npm dependencies are intentionally minimal and scoped to well-established, audited packages:

| Package                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `@0xpolygonid/js-sdk`  | iden3/Privado ID cryptographic primitives and key management |
| `@iden3/js-iden3-core` | DID and identity core types                                  |
| `@iden3/js-iden3-auth` | JWS/JWA authorization response construction and verification |
| `ethers`               | Ethereum key utilities                                       |
| `shell-quote`          | Shell token parsing used **only** for input sanitization     |
| `uuid`                 | UUID generation for protocol message IDs                     |

Core libraries governing identity management use pinned, well-tested versions to ensure stability and security.

### Key Storage and Isolation

All cryptographic material is persisted to `$HOME/.openclaw/billions/` — a directory that lives **outside the agent's workspace**:

| File               | Contents                                                                           |
| ------------------ | ---------------------------------------------------------------------------------- |
| `kms.json`         | Private keys — per-entry versioned format; keys are plain or AES-256-GCM encrypted |
| `identities.json`  | Identity metadata                                                                  |
| `defaultDid.json`  | Active DID and associated public key                                               |
| `challenges.json`  | Per-DID challenge history                                                          |
| `credentials.json` | Verifiable credentials                                                             |

There are several ways of storing private keys, to enable master key encryption as described in the **KMS Encryption** section below.

### KMS Encryption

Set the environment variable `BILLIONS_NETWORK_MASTER_KMS_KEY` to enable AES-256-GCM at-rest encryption for the private keys inside `kms.json`. When set, every key value is individually encrypted on write; when absent, keys are stored as plain hex strings.

**`kms.json` entry format**

Each entry in the array is versioned. The `alias` is always stored in plaintext — only the `key` value is encrypted:

```json
[
  {
    "version": 1,
    "provider": "plain",
    "data": {
      "alias": "secp256k1:abc123",
      "key": "deadbeef...",
      "createdAt": "2026-03-12T13:46:04.094Z"
    }
  },
  {
    "version": 1,
    "provider": "encrypted",
    "data": {
      "alias": "secp256k1:xyz456",
      "key": "<iv_hex>:<authTag_hex>:<ciphertext_hex>",
      "createdAt": "2026-02-11T13:00:02.032Z"
    }
  }
]
```

**Behavior summary**

| `BILLIONS_NETWORK_MASTER_KMS_KEY` | `provider` on disk | `key` value on disk     |
| --------------------------------- | ------------------ | ----------------------- |
| Not set                           | `"plain"`          | Raw hex string          |
| Set                               | `"encrypted"`      | `iv:authTag:ciphertext` |

> **Backward compatibility** — the legacy format `[ { "alias": "...", "privateKeyHex": "..." } ]` is still read correctly. On the first write the file is automatically migrated to the new per-entry format. No manual step is required.

**How to set the variable**

_Option 1 — openclaw skill config (recommended for agent deployments):_

Add an `env` block for the skill inside your openclaw config:

```json
"skills": {
  "entries": {
    "verified-agent-identity": {
      "env": {
        "BILLIONS_NETWORK_MASTER_KMS_KEY": "<your-strong-secret>"
      }
    }
  }
}
```

_Option 2 — shell or process environment:_

```bash
export BILLIONS_NETWORK_MASTER_KMS_KEY="<your-strong-secret>"
node scripts/createNewEthereumIdentity.js
node scripts/manualLinkHumanToAgent.js --challenge '{"name": "Agent Name", "description": "Short description of the agent"}'
```

For all other ways to pass environment variables to a skill see the [OpenClaw environment documentation](https://docs.openclaw.ai/help/environment).

**CRITICAL**: Save master keys securely and do not share them. If the master key is lost, all encrypted keys will be lost.

### Subprocess Execution Safety

**Only one specific command is ever executed: `openclaw message send`**, with a fixed, hardcoded argument structure. The binary name, the subcommand, and all flag names (`--target`, `--message`) are hardcoded. User-supplied values are only ever passed as the **values** of those flags, never as the command name, subcommand, or flag names. Nothing else can be executed. There is no mechanism to change the binary, add flags, or inject subcommands. Additional security properties:

1. **No shell interpolation**: `execFileSync(binary, argsArray)` bypasses the OS shell entirely. The OS `exec*` syscall receives the argument vector directly — shell metacharacters in argument values are treated as literal data.
2. **Argument-level input validation**: Before the call, all user-supplied values pass through two independent validation layers:
   - `validateTarget` — enforces a strict allowlist regex (`/^[A-Za-z0-9:._@\-\/]+$/`) on the `--target` value.
   - `assertNoShellOperators` — uses `shell-quote` to tokenize the input and rejects any token with an `op` property (i.e., `|`, `&`, `;`, `>`, `<`, `$()`, etc.).
3. **No dynamic code execution**: No `eval`, `new Function`, `child_process.exec`, or shell-interpolated `execSync` calls exist anywhere in the codebase.

Prompt injection and arbitrary code execution are structurally impossible: the executed command and its flags are hardcoded constants, and user data can only influence the string values passed to `--target` and `--message` after sanitization.

### Network and External Binary Policy

- All external https calls will be made to trusted resources. Signed JWS attestation (proof of agent ownership) is encoded securely by utilizing robust security practices and sent within user context directly to agent owner. It requires an explicit user consent to pass it to any external source. It is not sent automatically anywhere without user participation.
  All network calls are directed to legitimate DID resolvers (resolver.privado.id) or the project's own infrastructure (billions.network).
  These network calls cannot exfiltrate signed attestations or identity data to third-party services by skill design as they do not pass them. This is possible only through explicit action from the user side with consent. Also attestation contains only publicly verifiable information.
- No external binary other than `openclaw` is invoked.
- External URLs or verification links produced by the scripts are delivered to the user as a plaintext message via `openclaw message send`. The agent has no ability to follow, fetch, open, or interact with those URLs in any way - it only forwards the string to the user.

### Openclaw exec policy

Code in the scripts/shared/utils.js uses shell command execution, but in a security-conscious manner using execFileSync to prevent shell interpolation and includes sanitization logic (assertNoShellOperators) to mitigate injection risks when calling the openclaw CLI. 
Only the openclaw binary is invoked.

## Documentation

See [SKILL.md](SKILL.md) for detailed usage instructions and examples.
