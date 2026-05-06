# AttestRail

Confidential compliance attestations for institutional onchain finance.

AttestRail is a privacy-preserving compliance layer that lets RWA platforms, stablecoin issuers, and regulated DeFi
applications enforce eligibility, risk, and exposure rules over encrypted state. Per-user compliance attributes, issuer
policy thresholds, and an issuer-wide aggregate all stay encrypted. Only the final eligibility bit is publicly
decryptable (for UI visibility). On-chain transfer enforcement is FHE-native via `FHE.select`.

Built on [Zama FHEVM](https://github.com/zama-ai/fhevm-hardhat-template).

## Status

**Builder Track MVP complete.** 5 contracts deployed to Sepolia, 25 passing tests, mock attester service, frontend demo
scaffold.

### Sepolia Deployment (Chain ID: 11155111)

| Contract               | Address                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AttesterRegistry       | [`0xf714a62Dce395CB429E3FF310e52F40DBe2d0B3d`](https://sepolia.etherscan.io/address/0xf714a62Dce395CB429E3FF310e52F40DBe2d0B3d) |
| AttestRailPolicy       | [`0xc3F4D70068D7057AD253bB88e4E18e1d69f26A4D`](https://sepolia.etherscan.io/address/0xc3F4D70068D7057AD253bB88e4E18e1d69f26A4D) |
| AttestRailRegistry     | [`0x7275f7FBa4Fa3049054302C27E52F68A34a69000`](https://sepolia.etherscan.io/address/0x7275f7FBa4Fa3049054302C27E52F68A34a69000) |
| PrivateEligibilityGate | [`0x803Fc2767028b2fA9B117BE802F1333818D9929d`](https://sepolia.etherscan.io/address/0x803Fc2767028b2fA9B117BE802F1333818D9929d) |
| MockRWAToken           | [`0x34EDe0ef5928b55d1F2C2CBe1aB71dbd1c6cA3E3`](https://sepolia.etherscan.io/address/0x34EDe0ef5928b55d1F2C2CBe1aB71dbd1c6cA3E3) |

**Roles:**

- Admin/Issuer: `0x79a4Ca003893a3E80bbdBb57f59b9745018106f6`
- Attester: `0x9671D9C587A2f390100f21d1b0cA74734887755F`

### Measured Latency (Sepolia)

| Metric              | Value |
| ------------------- | ----- |
| Median (end-to-end) | ~48s  |
| P90                 | ~48s  |
| Failure rate        | 0%    |
| Avg gas per flow    | ~866K |

End-to-end = createEligibilityCheck + requestPublicDecryption + gatedTransfer (3 transactions).

## Architecture

```
Attester signs encrypted profile
  → Registry verifies EIP-712 signature + handle digest
    → Issuer sets encrypted thresholds
      → Gate runs per-user + aggregate FHE checks
        → FHE.select-gated RWA transfer (encrypted balances)
          → Public decryption for UI visibility only
```

### Contracts

| Contract                 | Purpose                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `AttesterRegistry`       | Admin-controlled attester set, nonce tracking                         |
| `AttestRailRegistry`     | EIP-712 verified encrypted profile storage                            |
| `AttestRailPolicy`       | Encrypted `euint64` thresholds, issuer ownership                      |
| `PrivateEligibilityGate` | Per-user + aggregate FHE eligibility, `FHE.select` aggregate update   |
| `MockRWAToken`           | FHE-aware ledger with `euint64` balances, `FHE.select` gated transfer |

### Encrypted State

All compliance attributes, policy thresholds, the issuer aggregate, eligibility results, and token balances are
encrypted. The only value that becomes publicly readable is the final `ebool eligible` bit — and only after explicit
`FHE.makePubliclyDecryptable`.

## Quick Start

```bash
# Install
npm install

# Compile
npm run compile

# Test (25 passing)
npx hardhat test

# Deploy (local)
npx hardhat run scripts/deploy.ts --network hardhat

# Seed default policy
npx hardhat run scripts/seed.ts --network hardhat

# Start mock attester
ATTESTER_PRIVATE_KEY=0x... REGISTRY_ADDRESS=0x... npx ts-node attester/service.ts

# Frontend dev
cd app && npm install && npm run dev
```

## Test Coverage

| Category             | Tests  | Scenarios                                                                    |
| -------------------- | ------ | ---------------------------------------------------------------------------- |
| Eligible path        | 1      | Full flow: profile → check → decrypt → transfer with balance verification    |
| Blocked paths        | 3      | Sanctioned, per-user cap exceeded, aggregate cap exceeded                    |
| Transfer guards      | 2      | Double consumption, parameter mismatch                                       |
| Trust layer          | 5      | Unknown signer, expired attestation, nonce replay, wrong user, digest tamper |
| Eligibility flow     | 2      | Wrong status revert, public decrypt correctness                              |
| Selective disclosure | 3      | Admin grant + officer decrypt, non-admin revert, unknown field               |
| Spikes               | 7      | S1 (ebool + public decrypt), S2 (handle digest), FHECounter                  |
| **Total**            | **25** |                                                                              |

## Disclosure and Inference Exposure

The eligible/blocked bit is publicly decryptable by design. This is a deliberate trade-off for the MVP:

- **What's revealed**: Whether a specific eligibility check passed or failed
- **What stays encrypted**: All compliance attributes, policy thresholds, the issuer aggregate, and token balances
- **On-chain enforcement**: Does NOT depend on the publicly decrypted value. Transfer gating uses
  `FHE.select(eligible, amount, 0)` entirely in the encrypted domain

**Inference risk**: Across many checks against the same user or policy, eligible/blocked outcomes correlate with private
attributes and aggregate utilization, allowing inference.

**Post-MVP mitigations** (designed, not enforced):

- Per-wallet rate limits
- Batched decryption
- Decoy checks
- Full Pattern B (confidential transfer amounts)

## Why FHE, Not ZK

AttestRail's load-bearing computation is shared, evolving state that no participant ever holds in cleartext.

- Per-user encrypted compliance attributes are provided by an approved attester, not user-claimed
- Issuer policy thresholds are encrypted `euint64` — competitors can't see your limits
- The issuer-wide aggregate updates via `FHE.select` on every check — no participant ever decrypts it
- Token balances are `euint64` — transfer amounts are gated in the encrypted domain

ZK proofs verify a static claim. FHE computes over encrypted state that evolves with every transaction.

## Project Structure

```
contracts/          Solidity contracts (5 production + 2 spike)
test/               Hardhat tests (25 passing)
attester/           Mock attester service (Node.js)
app/                Frontend demo (Vite + React + TypeScript)
scripts/            Deploy and seed scripts
docs/               Architecture, demo flow
spike/              S1 (decryption) and S2 (digest) spike findings
```

## License

BSD-3-Clause-Clear (see LICENSE)

## Docs

- [Architecture](docs/architecture.md)
- [Demo Flow](docs/demo-flow.md)
- [S1 Spike: Public Decryption](spike/decryption/FINDINGS.md)
