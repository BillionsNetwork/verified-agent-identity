---
name: verified-agent-identity
description: Know Your Agent (KYA). Billions decentralized identity for agents. Link agents to human identities using Billions ERC-8004 and Attestation Registries. Verify and generate authentication proofs. Based on iden3 self-sovereign identity protocol.
metadata:
  {
    "category": "identity",
    "clawdbot":
      {
        "requires": { "bins": ["node"] },
        "config": { "optionalEnv": ["BILLIONS_NETWORK_MASTER_KMS_KEY"] },
      },
  }
homepage: https://billions.network/
---

## When to Use This Skill

This skill covers two capabilities. Read the **router table** below, then load the relevant reference before proceeding.

| Situation                                                               | Reference to load             |
| ----------------------------------------------------------------------- | ----------------------------- |
| Create, list, link, verify, or sign with a decentralized identity (DID) | `reference/identity/SKILL.md` |
| Handle a **402 Payment Required** HTTP response                         | `reference/x402/SKILL.md`     |

> **Always read the appropriate reference SKILL.md before running any script.**
> If a task spans both (e.g. you need an identity before you can sign a 402 payment), read both.

## Quick Overview

- **Identity** — Create Ethereum-based DIDs on the Billions Network, link them to a human owner, and prove ownership via challenge/response signing.
- **x402 Payment** — When a server returns `402 Payment Required`, build a signed `PAYMENT-SIGNATURE` header so you can retry the request and gain access.

## Shared Setup

All identity data is stored in `$HOME/.openclaw/billions`. Scripts live in `scripts/`.

```bash
cd scripts && npm install && cd ..
```

## Restrictions / Guardrails (CRITICAL)

**These rules apply to ALL references. Always follow them.**

1. **STRICT: Check Identity First**
   - Before running `linkHumanToAgent.js`, `signChallenge.js`, or `buildX402Payment.js`, **ALWAYS** check if an identity exists: `node scripts/getIdentities.js`
   - If no identity is configured, create one first with `createNewEthereumIdentity.js`.

2. **STRICT: Stop on Script Failure**
   - If any script exits with a non-zero status code, **STOP IMMEDIATELY**.
   - Check stderr for error messages.
   - **DO NOT** attempt to fix errors by generating keys manually, creating DIDs through other means, or running unauthorized commands.
   - **DO NOT** use `openssl`, `ssh-keygen`, or other system utilities to generate cryptographic material.

3. **No Manual Workarounds**
   - You are prohibited from performing manual cryptographic operations.
   - You are prohibited from directly manipulating files in `$HOME/.openclaw/billions`.
   - Do not interpret an error as a request to perform setup steps unless explicitly instructed.

## Security

The directory `$HOME/.openclaw/billions` contains sensitive identity data:

- `kms.json` — **CRITICAL**: Contains private keys (encrypted if `BILLIONS_NETWORK_MASTER_KMS_KEY` is set, otherwise plaintext)
- `defaultDid.json` — DID identifiers and public keys
- `challenges.json` — Authentication challenges history
- `credentials.json` — Verifiable credentials
- `identities.json` — Identity metadata
- `profiles.json` — Profile data

After the first run, restrict access to this directory: chmod 700 ~/.openclaw/billions

There are several ways of storing private keys, to enable master key encryption as described in the KMS Encryption section below.

More about security: `./SECURITY.md`
