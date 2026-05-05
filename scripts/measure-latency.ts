/**
 * Latency Measurement Script — Task 26
 *
 * Exercises the full path N times on Sepolia and reports timing stats.
 * Usage: npx hardhat run scripts/measure-latency.ts --network sepolia
 */

import { ethers, fhevm } from "hardhat";
import fs from "fs";
import path from "path";

const N = parseInt(process.env.RUNS || "10", 10);

interface RunResult {
  run: number;
  eligible: boolean;
  createCheckGas: bigint;
  decryptGas: bigint;
  transferGas: bigint;
  totalMs: number;
  error?: string;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? `chain-${network.chainId}` : network.name;
  const addrFile = path.join("deployments", networkName, "addresses.json");

  if (!fs.existsSync(addrFile)) {
    throw new Error(`No deployment found at ${addrFile}. Run deploy + seed first.`);
  }

  const addr = JSON.parse(fs.readFileSync(addrFile, "utf-8"));
  const [signer] = await ethers.getSigners();

  const gate = await ethers.getContractAt("PrivateEligibilityGate", addr.gate, signer);
  const token = await ethers.getContractAt("MockRWAToken", addr.token, signer);
  const registry = await ethers.getContractAt("AttestRailRegistry", addr.registry, signer);

  // Check profile exists
  const hasProfile = await registry.profileExists(signer.address);
  if (!hasProfile) {
    throw new Error("Signer has no profile. Submit a profile first via the attester flow.");
  }

  const recipient = ethers.Wallet.createRandom().address;
  const results: RunResult[] = [];

  console.log(`Running ${N} latency measurements on ${networkName}...`);
  console.log(`Signer: ${signer.address}`);
  console.log(`Recipient: ${recipient}\n`);

  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    try {
      // Alternate between eligible (small amount) and blocked (huge amount) runs
      const amount = i % 2 === 0 ? 1000 : 999_999_999;

      // 1. Create eligibility check
      const tx1 = await gate.createEligibilityCheck(0, recipient, amount);
      const r1 = await tx1.wait();
      const checkId = (
        r1!.logs.find(
          (l: unknown) =>
            typeof l === "object" &&
            l !== null &&
            "fragment" in l &&
            (l as { fragment: { name: string } }).fragment?.name === "EligibilityCheckCreated",
        ) as { args: string[] }
      )?.args?.[0];

      // 2. Request public decryption
      const tx2 = await gate.requestPublicDecryption(checkId);
      const r2 = await tx2.wait();

      // 3. Read eligible bit
      const handle = await gate.getEncryptedEligible(checkId);
      const eligible = await fhevm.publicDecryptEbool(handle);

      // 4. Gated transfer
      const tx3 = await token.gatedTransfer(recipient, amount, checkId);
      const r3 = await tx3.wait();

      const totalMs = Date.now() - t0;

      const result: RunResult = {
        run: i + 1,
        eligible,
        createCheckGas: r1!.gasUsed,
        decryptGas: r2!.gasUsed,
        transferGas: r3!.gasUsed,
        totalMs,
      };
      results.push(result);
      console.log(
        `  Run ${i + 1}: ${eligible ? "eligible" : "blocked"} | ${totalMs}ms | gas: ${r1!.gasUsed + r2!.gasUsed + r3!.gasUsed}`,
      );
    } catch (e) {
      const totalMs = Date.now() - t0;
      results.push({
        run: i + 1,
        eligible: false,
        createCheckGas: 0n,
        decryptGas: 0n,
        transferGas: 0n,
        totalMs,
        error: (e as Error).message,
      });
      console.log(`  Run ${i + 1}: ERROR (${totalMs}ms) - ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // Compute stats
  const successful = results.filter((r) => !r.error);
  const times = successful.map((r) => r.totalMs).sort((a, b) => a - b);
  const failures = results.filter((r) => r.error).length;

  if (times.length === 0) {
    console.log("\nAll runs failed. No stats to report.");
    return;
  }

  const median = times[Math.floor(times.length / 2)];
  const p90 = times[Math.floor(times.length * 0.9)];
  const p99 = times[Math.floor(times.length * 0.99)];

  const totalGas = successful.reduce((s, r) => s + r.createCheckGas + r.decryptGas + r.transferGas, 0n);
  const avgGas = totalGas / BigInt(successful.length);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results (${successful.length} successful / ${N} total)`);
  console.log(`${"=".repeat(50)}`);
  console.log(`  Median:       ${median}ms`);
  console.log(`  P90:          ${p90}ms`);
  console.log(`  P99:          ${p99}ms`);
  console.log(`  Failure rate: ${failures}/${N} (${((failures / N) * 100).toFixed(1)}%)`);
  console.log(`  Avg gas/run:  ${avgGas}`);
  console.log(`${"=".repeat(50)}`);

  // Write results
  const outFile = path.join("deployments", networkName, "latency-results.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network: networkName,
        runs: N,
        median,
        p90,
        p99,
        failures,
        avgGas: avgGas.toString(),
        results: results.map((r) => ({
          ...r,
          createCheckGas: r.createCheckGas.toString(),
          decryptGas: r.decryptGas.toString(),
          transferGas: r.transferGas.toString(),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nResults written to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
