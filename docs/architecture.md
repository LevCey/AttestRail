# Architecture — AttestRail MVP

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (app/)                           │
│  Overview │ Investor │ Issuer │ Compliance                  │
│  ethers + Zama Relayer SDK                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
┌──────────────┐            ┌──────────────────────────────┐
│ Mock Attester│            │  Sepolia / Hardhat (FHEVM)   │
│ (attester/)  │            │                              │
│ EIP-712 sign │───────────▶│  AttesterRegistry            │
│              │            │  AttestRailPolicy            │
└──────────────┘            │  AttestRailRegistry          │
                            │  PrivateEligibilityGate      │
                            │  MockRWAToken                │
                            └──────────────────────────────┘
```

## Contract Dependency Graph

```
AttesterRegistry (admin)
    ↓ setRegistryContract
AttestRailRegistry (attesterRegistry, admin)
    ↓ setGateContract
PrivateEligibilityGate (policy, registry)
    ↓ setTokenContract
MockRWAToken (gate, issuer, initialMint)

AttestRailPolicy ()
    ↓ setGateContract
PrivateEligibilityGate (reads thresholds)
```

## FHE Type Map

| State                                           | Type      | Location                       |
| ----------------------------------------------- | --------- | ------------------------------ |
| kycVerified, jurisdictionAllowed, sanctionsFlag | `ebool`   | AttestRailRegistry             |
| riskTier                                        | `euint8`  | AttestRailRegistry             |
| currentExposure                                 | `euint64` | AttestRailRegistry             |
| maxExposure, issuerExposureCap                  | `euint64` | AttestRailPolicy               |
| totalActiveExposure                             | `euint64` | PrivateEligibilityGate         |
| encryptedEligible                               | `ebool`   | PrivateEligibilityGate (Check) |
| balances                                        | `euint64` | MockRWAToken                   |

## Cross-Contract ACL Wiring

FHE handles require explicit `FHE.allow(handle, address)` for each contract that needs to operate on them:

- **Registry → Gate**: Profile handles (kyc, jurisdiction, sanctions, riskTier, exposure) are allowed to the gate
  contract via `setGateContract`
- **Policy → Gate**: Encrypted thresholds (maxExposure, issuerExposureCap) are allowed to the gate contract via
  `setGateContract`
- **Gate → Token**: The `encryptedEligible` handle is allowed to the token contract via `setTokenContract`

## Public Decryption Pattern

**Flow**: Helper-based, not callback/polling.

1. Contract calls `FHE.makePubliclyDecryptable(handle)` — single transaction
2. Client reads result via `fhevm.publicDecryptEbool(handle)` — off-chain only
3. No cleartext bool stored on-chain

**ACL Requirements**:

- `FHE.allowThis(handle)` — required
- `FHE.makePubliclyDecryptable(handle)` — required
- `FHE.allow(handle, user)` — NOT required for public decrypt

**On-chain enforcement**: `FHE.select(eligible, amount, 0)` — transfer amount gated entirely in encrypted domain.

## Handle Digest Packing

```
digest = keccak256(abi.encodePacked(
    externalEbool.unwrap(kyc),        // bytes32
    externalEbool.unwrap(jurisdiction), // bytes32
    externalEbool.unwrap(sanctions),   // bytes32
    externalEuint8.unwrap(riskTier),   // bytes32
    externalEuint64.unwrap(exposure)   // bytes32
))
```

Off-chain equivalent: `ethers.keccak256(ethers.concat(handles))`

## Eligibility Computation

```
eligible = kycVerified
         AND jurisdictionAllowed
         AND NOT sanctionsFlag
         AND (riskTier <= maxRiskTier)
         AND (currentExposure + transferAmount <= maxExposure)
         AND (totalActiveExposure + transferAmount <= issuerExposureCap)

totalActiveExposure = FHE.select(eligible, newAggregate, totalActiveExposure)
```

## Transfer Enforcement

```
effectiveAmount = FHE.select(eligible, amount, 0)
balances[sender] -= effectiveAmount
balances[recipient] += effectiveAmount
```

If `eligible` is encrypted-false, `effectiveAmount` is encrypted-zero — balances unchanged.

## Latency

- **Local (hardhat mock)**: Instant — all FHE operations simulated
- **Sepolia (measured 2026-05-05, 5 runs)**:

| Run | Outcome  | Duration | Gas     |
| --- | -------- | -------- | ------- |
| 1   | eligible | 47,825ms | 865,536 |
| 2   | blocked  | 34,907ms | 865,796 |
| 3   | eligible | 47,905ms | 865,756 |
| 4   | blocked  | 48,472ms | 865,796 |
| 5   | eligible | 35,420ms | 865,756 |

**Summary**: Median 47.8s, P90 48.5s, 0% failure, avg gas 865,728.

Each run = createEligibilityCheck + requestPublicDecryption + gatedTransfer (3 transactions). Latency dominated by
Sepolia block time (~12s × 3 tx) + FHEVM coprocessor overhead.
