# dApp Frontend

Vite + React + TypeScript demo dApp for AttestRail. Separate from the
public landing page in `frontend/`.

## Pages

| Route | Purpose | Wallet required |
|-------|---------|-----------------|
| `/` | Overview — deployed addresses, network, connected wallet | No |
| `/issuer` | Public policy fields, set encrypted thresholds, decrypt own thresholds | Yes (issuer wallet) |
| `/investor` | Demo attributes → mock attester → submit profile → eligibility → finalize → transfer | Yes (investor wallet) |
| `/compliance` | Event history, eligible/blocked outcomes, selective disclosure trigger | Yes (compliance officer wallet, only for disclosure actions) |

## Configuration

Environment variables (Vite-prefixed):

- `VITE_RPC_URL` — Sepolia RPC endpoint
- `VITE_ATTESTER_URL` — mock attester service URL

Contract addresses are read at build time from
`../deployments/sepolia/addresses.json` (written by `scripts/deploy.ts`).

## Status

Not yet implemented. Scaffolds in Phase 6 of the build (Tasks 18–22).
