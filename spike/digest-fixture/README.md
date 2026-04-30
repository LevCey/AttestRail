# Spike S2 — Handle Digest Verification Fixture

This spike validates that the off-chain mock attester and the on-chain
registry compute the same `keccak256` digest over the same encrypted
handles, before any signed-attestation code is written.

## Goal

Pin the exact handle-packing format that
`AttestRailRegistry.submitProfile` and the off-chain mock attester service
will both use. The Zama input proof from `FHE.fromExternal` does not
verify that the attester signed the same encrypted values — that is what
the digest does. If the off-chain digest disagrees with the on-chain
digest by even one byte, every `submitProfile` call reverts, and unit
tests with same-process encryption will not catch it.

## Deliverables

A throwaway Hardhat project (in this folder) that:

1. Deploys a minimal `Registry` contract exposing
   `view function computeDigest(externalEbool a, externalEbool b, externalEbool c, externalEuint8 d, externalEuint64 e) returns (bytes32)`
   with body `keccak256(abi.encodePacked(unwrap(a), unwrap(b), unwrap(c), unwrap(d), unwrap(e)))`
   using the exact `externalE...` unwrapping the production registry will
   use.
2. Off-chain (Node + Relayer SDK), encrypts a known set of attribute
   values for `(registry, user)` and captures `buf.handles[]`.
3. Computes `keccak256` over the captured handles using the same packing.
4. Calls the contract's `computeDigest(...)` with the same encrypted
   inputs and asserts the on-chain digest equals the off-chain digest.

## Expected outputs (write to `docs/architecture.md`)

- The exact byte-level packing format that off-chain and on-chain code
  agree on
- Any byte-representation gotchas discovered (length, endianness, prefix
  bytes, padding)
- A canonical fixture: input plaintext → expected handles → expected
  digest, kept as a regression test

## Decision gate

Phase 2 (Trust Layer — `AttestRailRegistry.submitProfile`) does not
begin until this spike's equality test passes and the fixture is
committed. If the unwrap behavior turns out to require a non-trivial
adjustment, update `specs/design.md` EIP-712 section before writing
`submitProfile`.

## How to run

To be filled in when the spike is implemented.
