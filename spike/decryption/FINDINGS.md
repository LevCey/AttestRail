# Spike S1 — Findings: ebool + Public Decryption Pattern

**Date:** 2026-05-01
**Template:** fhevm-hardhat-template v0.4.1
**Packages:** @fhevm/solidity ^0.11.1, @fhevm/hardhat-plugin ^0.4.2
**Test result:** 5/5 passing (hardhat mock network)

---

## 1. Confirmed Flow: Synchronous / Helper-Based (NOT callback, NOT polling)

The public decryption flow is **not** callback-based and **not** polling-based.

**Solidity side:** The contract calls `FHE.makePubliclyDecryptable(handle)` which internally calls `ACL.allowForDecryption`. This is a single transaction — no oracle callback, no second finalize transaction.

**Client/test side:** After the `makePubliclyDecryptable` tx confirms, the caller reads the result via:

```typescript
const result: boolean = await fhevm.publicDecryptEbool(handleBytes32);
```

On Sepolia, the relayer SDK handles the KMS decryption round-trip. In mock mode (hardhat network), the mock instance resolves it immediately.

### Implication for PrivateEligibilityGate

The gate contract does NOT need a `finalizeCheck()` function or a callback handler. The pattern is:

1. Contract stores encrypted eligibility → `FHE.allowThis(handle)`
2. Contract marks it publicly decryptable → `FHE.makePubliclyDecryptable(handle)`
3. Any off-chain reader calls `fhevm.publicDecryptEbool(handle)` to get the cleartext

Steps 1–2 can happen in the same transaction.

---

## 2. Exact API Surface

### Solidity (contract side)

| Function | Signature | Purpose |
|---|---|---|
| `FHE.asEbool(bool)` | `→ ebool` | Trivial encrypt a plaintext bool |
| `FHE.fromExternal(externalEbool, bytes)` | `→ ebool` | Verify + convert user-encrypted input |
| `FHE.allowThis(ebool)` | `→ ebool` | Grant contract access to the handle |
| `FHE.allow(ebool, address)` | `→ ebool` | Grant a specific address access |
| `FHE.makePubliclyDecryptable(ebool)` | `→ ebool` | Mark handle for public decryption |

### TypeScript (test/client side)

| Function | Signature | Purpose |
|---|---|---|
| `fhevm.createEncryptedInput(contract, user)` | `.addBool(v).encrypt()` | Encrypt a bool off-chain |
| `fhevm.publicDecryptEbool(handle)` | `→ Promise<boolean>` | Read publicly decryptable ebool |
| `fhevm.userDecryptEbool(handle, contract, signer)` | `→ Promise<boolean>` | Read user-allowed ebool |

---

## 3. ACL Requirements

### Public decryption (what PrivateEligibilityGate needs)

```
FHE.allowThis(handle)              ← required: contract must access its own handle
FHE.makePubliclyDecryptable(handle) ← required: marks for public decryption
```

`FHE.allow(handle, userAddress)` is **NOT** needed for public decryption.

### User decryption (for comparison)

```
FHE.allowThis(handle)              ← required
FHE.allow(handle, userAddress)     ← required: user must be explicitly allowed
```

**Confirmed by test:** `userDecryptEbool` fails with "not authorized" when `FHE.allow` is missing, while `publicDecryptEbool` succeeds with only `allowThis` + `makePubliclyDecryptable`.

---

## 4. Local vs Sepolia Compatibility

### Local (hardhat network) — CONFIRMED WORKING

- `fhevm.isMock = true`
- All FHE operations are simulated by `@fhevm/mock-utils`
- `publicDecryptEbool` resolves immediately (no KMS round-trip)
- All 5 tests pass in ~300ms

### Sepolia — NOT YET TESTED (requires funded deployer)

- `fhevm.isMock = false`
- `publicDecryptEbool` goes through the relayer SDK → KMS
- Expected latency: seconds to minutes (depends on KMS + relayer)
- The contract code is identical; only the test harness differs
- The existing `FHECounterSepolia.ts` test in the template shows the Sepolia pattern

**Risk:** The mock may not perfectly replicate Sepolia ACL enforcement. Recommend running on Sepolia before finalizing the gate contract.

---

## 5. Blockers

**None for Phase 1 local development.** The pattern is clear and working.

### Open items for Sepolia validation

1. Need a funded Sepolia deployer wallet (MNEMONIC in hardhat vars)
2. Need INFURA_API_KEY configured
3. Latency measurement (T0 → T1) not yet done — requires Sepolia deployment

---

## 6. Reference Pattern for PrivateEligibilityGate

```solidity
// Minimal pattern — store + public decrypt
ebool private _eligible;

function setEligibility(externalEbool input, bytes calldata proof) external {
    _eligible = FHE.fromExternal(input, proof);
    FHE.allowThis(_eligible);
    FHE.makePubliclyDecryptable(_eligible);  // can be same tx
}

function getEligibilityHandle() external view returns (ebool) {
    return _eligible;
}
```

```typescript
// Client reads the result
const handle = await gate.getEligibilityHandle();
const isEligible: boolean = await fhevm.publicDecryptEbool(handle);
```

---

## 7. Files Created

- `contracts/EboolDecryptSpike.sol` — spike contract
- `test/EboolDecryptSpike.ts` — 5 passing tests covering trivial encrypt, encrypted input, public decrypt, and ACL difference
