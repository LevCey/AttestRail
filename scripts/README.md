# Scripts

## deploy.ts

Deploys all 5 contracts in order, performs post-deploy wiring, writes `deployments/<network>/addresses.json`.

```bash
npx hardhat run scripts/deploy.ts --network hardhat
npx hardhat run scripts/deploy.ts --network sepolia
```

Idempotent: skips if `addresses.json` already exists.

## seed.ts

Creates the default policy with encrypted thresholds and mints tokens to the issuer.

```bash
npx hardhat run scripts/seed.ts --network hardhat
```

Idempotent: skips if policy 0 already exists.

## measure-latency.ts

Runs N eligibility check + transfer cycles and reports timing stats.

```bash
RUNS=10 npx hardhat run scripts/measure-latency.ts --network sepolia
```

Requires a deployed + seeded environment with a submitted profile.
