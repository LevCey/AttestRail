import { ethers, fhevm } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? `chain-${network.chainId}` : network.name;
  const addrFile = path.join("deployments", networkName, "addresses.json");

  if (!fs.existsSync(addrFile)) {
    throw new Error(`No deployment found at ${addrFile}. Run deploy first.`);
  }

  // Initialize fhevm plugin (required for Sepolia; no-op on mock)
  try {
    await fhevm.initializeCLIApi();
  } catch {
    // Already initialized or mock mode
  }

  const addr = JSON.parse(fs.readFileSync(addrFile, "utf-8"));
  const [deployer] = await ethers.getSigners();

  console.log(`Seeding on ${networkName} (chainId: ${network.chainId})`);
  console.log(`Deployer/Issuer: ${deployer.address}`);

  const policy = await ethers.getContractAt("AttestRailPolicy", addr.policy);
  const token = await ethers.getContractAt("MockRWAToken", addr.token);

  // Check if default policy already exists (idempotent)
  const exists = await policy.policyExists(0);
  if (exists) {
    console.log("Default policy (id=0) already exists. Skipping seed.");
    return;
  }

  // Create default policy with encrypted thresholds
  const maxExposure = parseInt(process.env.DEFAULT_MAX_EXPOSURE || "100000", 10);
  const issuerCap = parseInt(process.env.DEFAULT_ISSUER_EXPOSURE_CAP || "10000000", 10);

  console.log(`Creating default policy: maxExposure=${maxExposure}, issuerCap=${issuerCap}`);

  const encrypted = await fhevm
    .createEncryptedInput(addr.policy, deployer.address)
    .add64(maxExposure)
    .add64(issuerCap)
    .encrypt();

  const tx = await policy.createPolicy(
    true, // kycRequired
    true, // jurisdictionRequired
    true, // blockSanctioned
    2, // maxRiskTier
    encrypted.handles[0],
    encrypted.handles[1],
    encrypted.inputProof,
  );
  await tx.wait();
  console.log("✓ Default policy created (id=0)");

  // Mint tokens to issuer if balance is zero
  const initialMint = parseInt(process.env.INITIAL_MINT || "1000000", 10);
  console.log(`Minting ${initialMint} tokens to issuer ${addr.issuer}`);
  await (await token.mint(addr.issuer, initialMint)).wait();
  console.log("✓ Tokens minted");

  console.log("\nSeed complete:");
  console.log(`  Policy ID: 0`);
  console.log(`  Issuer: ${addr.issuer}`);
  console.log(`  Token: ${addr.token}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
