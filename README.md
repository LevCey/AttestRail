# AttestRail

Confidential compliance attestations for institutional onchain finance.

AttestRail is a privacy-preserving compliance layer that lets RWA platforms,
stablecoin issuers, and regulated DeFi applications enforce eligibility,
risk, and exposure rules over encrypted state. Per-user compliance
attributes, issuer policy thresholds, and an issuer-wide *reserved*
exposure aggregate (committed at eligibility-check time) all stay
encrypted. Only the final eligibility decision is revealed.

Built on [Zama FHEVM](https://github.com/zama-ai/fhevm-hardhat-template).

## Status

Early development. The Builder Track MVP — *Private RWA Eligibility Gate* —
is in planning. Contracts, tests, mock attester service, and frontend demo
are not yet committed.

The first work item is Phase 0: two technical spikes that lock down the
two integration assumptions on which the entire architecture depends —
the exact async public-decryption API surface in the current Zama
template, and the byte-level equality between off-chain and on-chain
handle-digest computation for EIP-712 verification. Production contracts
will not be written until both spike outputs are recorded in
`docs/architecture.md`. This is intentional: cheap to verify now,
expensive to discover wrong in week three of contract work.

Architecture, scope, and Zama-specific technical verification documents
are maintained alongside this repository in the LeventLabs Zama project
workspace and will be folded into `docs/` as the project lands.

## Why FHE, Not ZK

AttestRail's load-bearing computation is shared, evolving state that no
participant ever holds in cleartext.

- Per-user encrypted compliance attributes are provided by an approved
  attester, not by the user.
- Issuer policy thresholds (per-user exposure ceiling, issuer-wide
  aggregate cap) are encrypted commercial signal.
- An encrypted issuer-wide aggregate of *reserved* exposure (committed at
  eligibility-check time, not at transfer execution) updates on every check
  via `FHE.select`, with no public branch and no participant ever seeing
  the cleartext. See "Reserved-Exposure Semantics" below for what the
  reservation means in practice.

ZK-shielded approaches cannot maintain that aggregate — there is no prover
who knows the value to prove anything about it. FHE evaluates the cap
comparison directly against encrypted state. This is the primitive that
makes AttestRail an FHE product rather than a generic privacy demo.

## Architecture

Five on-chain components plus an off-chain attester service:

1. **AttesterRegistry** — admin-controlled set of off-chain attesters whose
   EIP-712 signatures the system trusts.
2. **AttestRailRegistry** — encrypted user compliance profiles. Submission
   requires a valid signed attestation from an approved attester; replay
   and tamper protection via per-attestation nonce and handle digest.
3. **AttestRailPolicy** — public boolean toggles and risk-tier ceiling
   alongside encrypted `euint64` `maxExposure` and `issuerExposureCap`.
4. **PrivateEligibilityGate** — runs encrypted per-user policy checks and
   the encrypted issuer-wide aggregate-cap check, conditionally updates
   the encrypted aggregate via `FHE.select`, and triggers async public
   decryption of the final eligibility bit. Each `Check` record binds
   `(user, policyId, to, amount)` at creation time so `gatedTransfer` can
   verify them at consumption. The issuer aggregate is **lazy-initialized**
   on the first check for each policy via `policyContract.getIssuer(policyId)`
   — no deploy-time coupling between `AttestRailPolicy` and the gate.
5. **MockRWAToken** — demo asset whose `gatedTransfer(address to, uint64 amount, bytes32 checkId)`
   requires a finalized, eligible, unconsumed, parameter-matched check. Width is
   `uint64` to match the `euint64` aggregate; widening to `uint256` would silently
   truncate against the encrypted aggregate.

Off-chain:

- **Mock Attester Service** — Node script using the Zama Relayer SDK to
  encrypt attributes for `(contractAddress, userAddress)` and sign EIP-712
  attestations binding the encrypted handles, expiry, and nonce to the
  user wallet.

## Trust Model

Encrypted attributes are only as trustworthy as their source. AttestRail
does not allow users to author their own compliance state. Approved
attesters are external compliance providers (KYC/AML vendors, internal
compliance teams, regulated entities) who:

1. Verify the user's real-world identity and compliance state off-chain.
2. Encrypt the resulting attributes for the AttestRail registry contract
   and the user's wallet.
3. Sign an EIP-712 attestation binding the encrypted handles, expiry, and
   single-use nonce to the user.

The on-chain registry verifies the signer is in the approved set before
storing the encrypted profile. The Zama input proof confirms ciphertexts
were correctly encrypted for the target user and contract; the attester
signature confirms the underlying values came from a trusted source. Both
layers are required.

## Disclosure And Inference Exposure

Pattern A (async public decryption) reveals the cleartext eligible/blocked
bit by design. This is the minimum disclosure needed for a non-confidential
mock token to act on the result. Across many checks, eligible/blocked
outcomes correlate with private attributes and can leak information.

Production deployments are expected to pair AttestRail with:

- Per-wallet rate limits on eligibility checks.
- Batched check finalization across multiple users.
- Issuer-initiated decoy checks to break attribute-to-outcome correlation.
- Migration to confidential balances and `FHE.select`-gated transfers
  where even the boolean outcome is too sensitive.

These mitigations are documented in the architecture rather than enforced
in the Builder MVP. The pitch and demo do not claim full privacy under
sustained observation.

### Reserved-Exposure Semantics

The encrypted issuer aggregate (`totalActiveExposure`) tracks **reserved**
exposure — transfer amounts committed at eligibility-check time — not
**executed** exposure. The aggregate increments inside
`createEligibilityCheck` via `FHE.select`, before public decryption
resolves and well before any `gatedTransfer` runs. A user who passes
eligibility but abandons the flow leaves the aggregate inflated.

We treat this as a confidential commitment line, analogous to a regulated
bank's reserved credit line. Release-on-non-execution is post-MVP; for
the Builder MVP the aggregate accumulates monotonically per policy.

Under sustained DoS (an adversary creating eligibility checks they never
finalize), the aggregate eventually exceeds the cap and legitimate
transfers are blocked. The failure mode is one-sided — false negatives
(legitimate users blocked) rather than false positives (over-cap
transfers approved). This is the correct safety property for a
compliance primitive: refusing too much is recoverable, approving too
much is not.

## Planned Repository Layout

```
spike/                         # Phase 0 — throwaway code, kept for the record
  decryption/                  #   S1: async public decryption end-to-end
  digest-fixture/              #   S2: handle-digest equality fixture
contracts/
  AttesterRegistry.sol
  AttestRailRegistry.sol
  AttestRailPolicy.sol
  PrivateEligibilityGate.sol
  MockRWAToken.sol
test/
  AttesterRegistry.test.ts
  AttestRailRegistry.test.ts
  PrivateEligibilityGate.test.ts
  MockRWAToken.test.ts
scripts/
  deploy.ts                    # Idempotent: deploy + post-deploy admin ops
  seed.ts                      # Default policy + mock token mint + optional aggregate prepop
  measure-latency.ts           # Sepolia public-decryption latency profile
attester/
  encrypt.ts
  sign.ts
app/                           # Vite + React + TypeScript dApp
  src/
docs/
  architecture.md              # Phase 0 outputs, latency numbers, design decisions
  demo-flow.md
  pitch.md
deployments/
  sepolia/addresses.json       # Written by scripts/deploy.ts
```

## Getting Started

The intended order of work is:

1. **Phase 0 spikes** in `spike/`. Run S1 (async public decryption) and S2
   (handle-digest equality) against Sepolia. Record the chosen decryption
   pattern, observed latency range, and the exact handle-packing format
   in `docs/architecture.md`. Do not skip this step — the contract
   surface depends on these decisions.
2. **Scaffold** the main project from the official Zama FHEVM Hardhat
   template, pinning the cloned commit hash in `docs/architecture.md`.
3. **Implement** the five contracts plus the mock attester service.
4. **Deploy and seed** via the idempotent scripts (see below).
5. **Measure** Sepolia decryption latency and update the README status
   line.

Day-to-day development:

```bash
npm install
npx hardhat test --network hardhat
npx hardhat node                            # in a separate shell
npx hardhat test --network localhost
```

Deploy + post-deploy admin ops + seed (idempotent, single source of
deployment truth):

```bash
npx hardhat run scripts/deploy.ts --network sepolia
npx hardhat run scripts/seed.ts --network sepolia
npx hardhat fhevm check-fhevm-compatibility --network sepolia --address <each>
```

Decryption latency profile (writes results back into `docs/architecture.md`):

```bash
npx hardhat run scripts/measure-latency.ts --network sepolia
```

A `.env.example` will be added with the variables required by the Zama
template, the deployer key, the mock attester key, and the issuer
address. Do not commit private keys. `deployments/sepolia/addresses.json`
is the source of truth for the frontend dApp and the mock attester
service.

## Roadmap

**Builder Track MVP**

- Contracts: attester registry, encrypted profile registry, encrypted
  policy with `euint64` thresholds, eligibility gate with encrypted
  aggregate update, mock RWA token.
- Mock attester service signing EIP-712 attestations.
- Test coverage for: attester accept/reject, eligible, sanctioned-blocked,
  per-user exposure-blocked, aggregate-cap-blocked, replay/tamper rejection.
- Frontend demo with investor, issuer, and compliance views.
- Sepolia deployment and measured public-decryption latency.
- Demo video.

**Next**

- Reserved-exposure release: cancellation, expiry-based release, and
  rebalancing of the encrypted aggregate when an eligibility check is
  not executed. Closes the DoS surface noted in the Reserved-Exposure
  Semantics section.
- Confidential transfer amounts (`externalEuint64`).
- Inference-mitigation primitives (rate limits, batched finalization,
  decoy checks).
- Real attester integration (signed claims from a regulated provider).
- Selective disclosure flows extended from admin-only (MVP) to per-role
  authorization (issuer of an active policy, named compliance officers).

## References

In-repo (populated as the project lands):

- `docs/architecture.md` — Phase 0 spike outputs (decryption pattern,
  handle-digest packing fixture), measured Sepolia latency, and pinned
  template commit hash
- `docs/demo-flow.md` — end-to-end demo walkthrough across the eligible,
  blocked-by-sanctions, blocked-by-aggregate-cap, and replay-rejected
  scenarios
- `deployments/sepolia/addresses.json` — deployed contract addresses
  (source of truth for the frontend dApp and mock attester service)

External:

- Zama FHEVM Hardhat Template — https://github.com/zama-ai/fhevm-hardhat-template
- Zama Solidity guides — https://docs.zama.org/protocol/solidity-guides/getting-started/setup
- Zama ACL — https://docs.zama.org/protocol/solidity-guides/smart-contract/acl
- Zama Relayer SDK — https://github.com/zama-ai/relayer-sdk
- EIP-712 — https://eips.ethereum.org/EIPS/eip-712
- OpenZeppelin EIP712 + ECDSA — https://docs.openzeppelin.com/contracts/utils#cryptography

## License

License selection pending. The repository will state its license before
the first contract commit.

## Maintainer

LeventLabs.
