import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("AttestRailRegistry", "0x7275f7FBa4Fa3049054302C27E52F68A34a69000");
  const exists = await registry.profileExists(signer.address);
  console.log(`Profile exists for ${signer.address}: ${exists}`);
}

main().catch(console.error);
