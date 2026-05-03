# Spike S1 — Async Public Decryption End-to-End

This spike validates the exact API surface for triggering and observing a public decryption of an `ebool` on Sepolia,
before any production contract is written.

## Goal

Pin the pattern that `PrivateEligibilityGate.requestPublicDecryption` and `finalizeCheck` will use. The spec does not
assume callback vs. polling vs. relayer-mediated; this spike picks one based on what the current template actually
supports.

## Deliverables

A throwaway Hardhat project (in this folder) that:

1. Deploys a minimal contract accepting an `externalEbool`, converting via `FHE.fromExternal`, and exposing functions to
   trigger public decryption and read the result.
2. Encrypts `true` and `false` inputs through the Relayer SDK.
3. Triggers decryption and observes the cleartext result on Sepolia.
4. Measures end-to-end latency (T0 = trigger tx confirmation, T1 = result readable on-chain). At least 3 runs to get a
   rough range.

## Expected outputs (write to `docs/architecture.md`)

- Exact function names and signatures used (e.g., `FHE.makePubliclyDecryptable(...)` vs. another API)
- Callback vs. polling pattern
- Gas cost of trigger and finalize transactions
- Observed latency range
- Any error modes encountered

## Decision gate

Phase 1 contract work does not begin until this spike's outputs are recorded in `docs/architecture.md`. If the API
surface differs materially from what the spec assumes, update `specs/design.md` and `specs/tasks.md` Task 10 before
scaffolding the eligibility gate.

## How to run

To be filled in when the spike is implemented. Expected setup:

- `npm install` in this folder (separate from main project)
- Configure Sepolia RPC + a funded deployer key
- `npx hardhat run scripts/run-spike.ts --network sepolia`
