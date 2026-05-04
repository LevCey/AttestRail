import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  if (network.chainId === 1n) {
    throw new Error("Refusing to deploy on mainnet");
  }

  console.log(`Deploying to ${network.name} (chainId: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  // Resolve issuer and attester from env or default to deployer
  const issuerAddress = process.env.ISSUER_ADDRESS || deployer.address;
  const attesterKey = process.env.ATTESTER_PRIVATE_KEY;
  const attesterAddress = attesterKey ? new ethers.Wallet(attesterKey).address : deployer.address;
  const initialMint = parseInt(process.env.INITIAL_MINT || "1000000", 10);

  console.log(`Issuer: ${issuerAddress}`);
  console.log(`Attester: ${attesterAddress}`);

  // Check for existing deployment
  const outDir = path.join("deployments", network.name === "unknown" ? `chain-${network.chainId}` : network.name);
  const outFile = path.join(outDir, "addresses.json");

  if (fs.existsSync(outFile)) {
    console.log(`Existing deployment found at ${outFile}. Skipping deploy (idempotent).`);
    const existing = JSON.parse(fs.readFileSync(outFile, "utf-8"));
    console.log(existing);
    return;
  }

  // 1. AttesterRegistry
  const AttesterRegistry = await ethers.getContractFactory("AttesterRegistry");
  const attesterRegistry = await AttesterRegistry.deploy(deployer.address);
  await attesterRegistry.waitForDeployment();
  console.log(`AttesterRegistry: ${await attesterRegistry.getAddress()}`);

  // 2. AttestRailPolicy
  const Policy = await ethers.getContractFactory("AttestRailPolicy");
  const policy = await Policy.deploy();
  await policy.waitForDeployment();
  console.log(`AttestRailPolicy: ${await policy.getAddress()}`);

  // 3. AttestRailRegistry
  const Registry = await ethers.getContractFactory("AttestRailRegistry");
  const registry = await Registry.deploy(await attesterRegistry.getAddress(), deployer.address);
  await registry.waitForDeployment();
  console.log(`AttestRailRegistry: ${await registry.getAddress()}`);

  // 4. PrivateEligibilityGate
  const Gate = await ethers.getContractFactory("PrivateEligibilityGate");
  const gate = await Gate.deploy(await policy.getAddress(), await registry.getAddress());
  await gate.waitForDeployment();
  console.log(`PrivateEligibilityGate: ${await gate.getAddress()}`);

  // 5. MockRWAToken
  const Token = await ethers.getContractFactory("MockRWAToken");
  const token = await Token.deploy(await gate.getAddress(), issuerAddress, initialMint);
  await token.waitForDeployment();
  console.log(`MockRWAToken: ${await token.getAddress()}`);

  // Post-deploy wiring
  console.log("\nPost-deploy wiring...");

  await (await attesterRegistry.setRegistryContract(await registry.getAddress())).wait();
  console.log("  ✓ AttesterRegistry.setRegistryContract");

  await (await attesterRegistry.setAttester(attesterAddress, true)).wait();
  console.log(`  ✓ AttesterRegistry.setAttester(${attesterAddress})`);

  await (await registry.setGateContract(await gate.getAddress())).wait();
  console.log("  ✓ AttestRailRegistry.setGateContract");

  await (await policy.setGateContract(await gate.getAddress())).wait();
  console.log("  ✓ AttestRailPolicy.setGateContract");

  await (await gate.setTokenContract(await token.getAddress())).wait();
  console.log("  ✓ PrivateEligibilityGate.setTokenContract");

  // Write addresses
  const addresses = {
    attesterRegistry: await attesterRegistry.getAddress(),
    policy: await policy.getAddress(),
    registry: await registry.getAddress(),
    gate: await gate.getAddress(),
    token: await token.getAddress(),
    attester: attesterAddress,
    issuer: issuerAddress,
    deployer: deployer.address,
    network: network.name,
    chainId: Number(network.chainId),
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses written to ${outFile}`);
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
