# Scripts

Operational scripts for AttestRail. To be implemented in Phase 1+.

## Planned

| Script | Purpose | Phase |
|--------|---------|-------|
| `deploy.ts` | Idempotent deployment + post-deploy admin ops; writes `deployments/<network>/addresses.json` | Phase 7, Task 23 |
| `seed.ts` | Default policy with encrypted thresholds, mock token mint to issuer, optional aggregate prepopulation | Phase 7, Task 24 |
| `measure-latency.ts` | Sepolia decryption-latency profile; writes results to `docs/architecture.md` | Phase 7, Task 26 |

All scripts are invoked via Hardhat:

```bash
npx hardhat run scripts/<name>.ts --network <network>
```

## Idempotency

`deploy.ts` and `seed.ts` MUST be idempotent. Re-running detects existing
addresses / state and skips already-completed steps. Mismatches (e.g.,
attester address differs from `ATTESTER_PRIVATE_KEY`) fail loudly.

This is the single source of deployment truth — README and
`docs/demo-flow.md` reference these scripts rather than reproducing
instructions.
