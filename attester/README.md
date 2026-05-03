# Mock Attester Service

Off-chain Node service that signs EIP-712 attestations for AttestRail. The mock attester represents a KYC/AML provider
in the demo. Production deployments would replace it with a regulated provider.

## Responsibilities

1. Accept a request containing the user wallet and demo attribute values.
2. Encrypt attributes for `(AttestRailRegistry address, user address)` using the Zama Relayer SDK.
3. Compute `handlesDigest = keccak256(packed(handle bytes))` matching the on-chain registry's expected packing (locked
   by Spike S2).
4. Sign an EIP-712 `Attestation` struct using `ATTESTER_PRIVATE_KEY`. Domain MUST exactly match the registry's
   `EIP712("AttestRail", "1")` plus `chainId` and `verifyingContract = REGISTRY_ADDRESS`.
5. Return ciphertexts, input proof, attestation, and signature in JSON.

## Trust boundary

- The service never accepts user-supplied private keys.
- Logs include `user` and `nonce` only — never the private key or the attribute values.
- Per-attestation nonces are CSPRNG (`crypto.randomBytes(32)`); the on-chain `usedNonces` mapping is the source of truth
  for replay protection. No in-process replay cache is kept.
- CORS is restricted to the deployed frontend domain.

## Status

Implemented. Two endpoints:

- `POST /attest` — accepts `{ user, attributes, handlesDigest? }`. If `handlesDigest` is provided, signs and returns the
  attestation. If not, returns attributes + nonce + expiry for the frontend to encrypt first.
- `POST /sign` — accepts `{ user, handlesDigest, nonce?, expiry? }` and returns the signed attestation.
- `GET /health` — returns attester address.

## Running

```bash
ATTESTER_PRIVATE_KEY=0x... \
REGISTRY_ADDRESS=0x... \
CHAIN_ID=31337 \
npx ts-node attester/service.ts
```

## Demo flow

1. Frontend encrypts attributes via Relayer SDK → gets `handles` + `inputProof`
2. Frontend computes `handlesDigest = keccak256(concat(handles))`
3. Frontend calls `POST /sign` with `{ user, handlesDigest }`
4. Attester signs EIP-712 attestation and returns `{ attestation, signature }`
5. Frontend calls `submitProfile(handles, inputProof, attestation, signature)`
