# Security Policy

This document describes the security model of the `verified-agent-identity` skill, the threats it does and does not defend against, and the rationale behind design decisions that may surface in automated security scans.

## Scope

`verified-agent-identity` is a **local CLI skill**. It runs on a single operator's host, creates a decentralized identity (DID) for an AI agent, signs challenges with the agent's private key, and persists state under `~/.openclaw/billions/`. It is not a network service, has no listening port, and does not provide multi-tenant trust boundaries.

The only secret it manages is the agent's identity private key, stored in `~/.openclaw/billions/kms.json`.

## Threat Model

**In scope:**

- Preventing the identity key from being accidentally committed into the workspace or read by tools that operate inside the project directory.
- Protecting the key against casual disclosure on a single-user host (e.g. shoulder-surfing, accidental file sharing, careless backups).
- Preventing operator mistakes that would let an identity key double as an asset-holding wallet key.
- Providing opt-in at-rest encryption for shared/multi-user hosts and for environments where compliance requires it.

**Out of scope:**

- An attacker with read access to the operator's home directory or process memory. This is equivalent to full host compromise; no local secret-storage scheme defends against it without an external HSM or OS keystore, and integrating those would expand the dependency surface beyond what this skill commits to.
- Full-disk forensic recovery on a host the attacker physically controls.
- Hostile code already running with the operator's privileges.

## Storage Modes

Private keys are written to `~/.openclaw/billions/kms.json` in one of two formats, selected by the presence of the `BILLIONS_NETWORK_MASTER_KMS_KEY` environment variable.

| `BILLIONS_NETWORK_MASTER_KMS_KEY` | `provider` on disk | `key` value on disk     | Posture                      |
| --------------------------------- | ------------------ | ----------------------- | ---------------------------- |
| Not set                           | `"plain"`          | Raw hex string          | Acceptable on a single-user host with `chmod 700 ~/.openclaw/billions`. |
| Set                               | `"encrypted"`      | `iv:authTag:ciphertext` | **Recommended for all deployments.** AES-256-GCM at rest. |

Mode is selected per-write, so an operator can switch from `plain` to `encrypted` at any time by exporting the variable before the next key creation or import — no migration step is required.

## Compensating Controls

The following mitigations are present in the codebase and the documented installation flow:

- **Out-of-workspace storage.** Keys live under `~/.openclaw/billions/`, never inside the project directory. Tools (and the agent itself) that operate inside the workspace cannot read or exfiltrate them.
- **Filesystem hardening.** The README instructs the operator to run `chmod 700 ~/.openclaw/billions` after the first run (`README.md` → "Key Storage and Isolation").
- **Dedicated-key warning.** The README warns the operator never to import an Ethereum wallet key that holds assets, only a dedicated identity key (`README.md` step 2 warning under the Human CTA).
- **At-rest encryption available behind one env var.** AES-256-GCM is provided via `BILLIONS_NETWORK_MASTER_KMS_KEY`. No code change, no migration, no extra dependency.
- **Versioned on-disk format.** Each `kms.json` entry carries a `version` and `provider` field, so future format upgrades (e.g. an OS-keystore provider) can ship without breaking existing installs. Legacy entries auto-migrate on next write (see `scripts/shared/storage/keys.js`, `_decodeEntry` legacy branch).

## Scanner Findings — Acknowledged Risks

### Identity and Privilege Abuse — `scripts/shared/storage/keys.js` (plaintext storage branch)

**Finding (verbatim):**

> When no master key is configured, the key-storage code writes the raw private key value into `kms.json` as a plaintext entry.
>
> **User impact** — Anyone or any process that can read `~/.openclaw/billions/kms.json` may be able to impersonate the agent identity; if a real asset-holding Ethereum key is imported, the impact could extend beyond the agent identity.
>
> **Recommendation** — Set `BILLIONS_NETWORK_MASTER_KMS_KEY` before creating or importing keys, use only a dedicated no-assets identity key, restrict `~/.openclaw/billions` permissions, and avoid importing any wallet key that controls funds.

**Status: acknowledged, accepted — every item in the scanner's recommendation is already a documented and shipped control.**

The flagged code path is the documented `provider: "plain"` mode (see [Storage Modes](#storage-modes)). It is the default **only because the env var is unset**; setting `BILLIONS_NETWORK_MASTER_KMS_KEY` switches the same code path to AES-256-GCM with no further operator action. The threat the plaintext mode enables — local read of `~/.openclaw/billions/kms.json` on the operator's own host — is out of scope per the [Threat Model](#threat-model) above: an attacker with that level of access already controls the operator's shell history, SSH agent, browser secrets, and process memory.

#### Recommendation-to-Control mapping

| Scanner recommendation | Control in this repository | Reference |
| --- | --- | --- |
| Set `BILLIONS_NETWORK_MASTER_KMS_KEY` before creating or importing keys | A `> Note` block immediately precedes every key-creation command in the README, instructing the operator to set the variable. The `KMS Encryption` section documents the on-disk format change and the AES-256-GCM scheme. | `README.md` → "KMS Encryption" |
| Use only a dedicated, no-assets identity key | An explicit `> Warning` block under the key-creation step tells the operator never to pass an asset-holding wallet key to `--key`. | `README.md` step 2 of "Human CTA" |
| Restrict `~/.openclaw/billions` permissions | The "Key Storage and Isolation" section instructs `chmod 700 ~/.openclaw/billions` after the first run. The directory itself sits **outside the agent workspace**, so workspace-scoped tools cannot read it. | `README.md` → "Key Storage and Isolation" |
| Avoid importing any wallet key that controls funds | Same `> Warning` block as above; reinforced in the [Operator Checklist](#operator-checklist) below. | `README.md` step 2 warning + this document |

#### Why the plaintext mode is retained

1. **Zero-config local development and CI smoke tests** — no master secret to fetch or commit.
2. **Backward compatibility** — existing `kms.json` files written by earlier versions of the skill remain readable; legacy entries auto-migrate on the next write (`scripts/shared/storage/keys.js` → `_decodeEntry` legacy branch).
3. **Single code path** — the same write path becomes encrypted at rest the moment `BILLIONS_NETWORK_MASTER_KMS_KEY` is set. There is no separate "secure mode" the operator has to migrate to, so the plaintext default cannot drift away from the encrypted path over time.

The [Operator Checklist](#operator-checklist) is the recommended deployment posture and exactly matches the scanner's recommendation.

## Operator Checklist

1. **Set the master key first.**
   ```bash
   export BILLIONS_NETWORK_MASTER_KMS_KEY="<a strong secret>"
   ```
   Do this **before** the first `node scripts/createNewEthereumIdentity.js`. Keys created without it are written as `provider: "plain"`.
2. **Use a dedicated identity key.** Never reuse an Ethereum private key that holds assets. If the `kms.json` file is exposed, every key inside it should be revocable / disposable.
3. **Restrict the storage directory.**
   ```bash
   chmod 700 ~/.openclaw/billions
   ```
4. **Back up the master key out of band.** If `BILLIONS_NETWORK_MASTER_KMS_KEY` is lost, every entry written under `provider: "encrypted"` is unrecoverable.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately to the Billions Network security contact rather than filing a public issue. Open an issue marked `security` requesting a private disclosure channel if you do not already have one.
