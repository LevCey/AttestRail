# Demo Flow — AttestRail MVP

## Prerequisites

```bash
npm install
npx hardhat compile
```

## Scenario 1: Eligible Investor

### 1. Deploy contracts

```bash
npx hardhat run scripts/deploy.ts --network hardhat
```

### 2. Seed default policy

```bash
npx hardhat run scripts/seed.ts --network hardhat
```

### 3. Start mock attester

```bash
ATTESTER_PRIVATE_KEY=<key> REGISTRY_ADDRESS=<addr> npx ts-node attester/service.ts
```

### 4. Run the eligible path

The investor has: KYC ✅, jurisdiction ✅, not sanctioned, riskTier=1, exposure=5000. Transfer: 10,000 tokens to
recipient.

**Expected**: Eligibility check passes → `eligible = true` → gated transfer moves 10,000 tokens.

### 5. Verify via tests

```bash
npx hardhat test test/AttestRail.ts
```

Test: "full flow: submit profile → create check → public decrypt → gated transfer"

## Scenario 2: Sanctioned Investor (Blocked)

Investor has `sanctionsFlag = true`. All other attributes are valid.

**Expected**: `eligible = false` → gated transfer is a zero-amount no-op → balances unchanged.

Test: "sanctioned investor → eligible=false → zero-amount transfer"

## Scenario 3: Aggregate Cap Exceeded (Blocked)

Issuer cap is 15,000. First check for 10,000 passes (aggregate = 10,000). Second check for 10,000 fails (20,000 >
15,000).

**Expected**: Second check `eligible = false` → aggregate unchanged.

Test: "aggregate + amount > issuerCap → eligible=false"

## Scenario 4: Replay / Tamper Rejection

- **Replayed nonce**: `NonceReused` revert
- **Tampered handles**: `DigestMismatch` revert
- **Wrong user**: `UserMismatch` revert
- **Unknown signer**: `AttesterNotApproved` revert
- **Double consumption**: `CheckConsumed` revert
- **Param mismatch**: `CheckParamMismatch` revert

All covered by the test suite (16 passing tests).

## Running All Tests

```bash
npx hardhat test
```

Expected output: 16 passing.
