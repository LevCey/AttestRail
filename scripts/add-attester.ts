import { ethers } from "hardhat";
import "dotenv/config";

async function main() {
  const attesterKey = process.env.ATTESTER_PRIVATE_KEY!;
  const attesterAddress = new ethers.Wallet(attesterKey).address;

  const registry = await ethers.getContractAt("AttesterRegistry", "0xf714a62Dce395CB429E3FF310e52F40DBe2d0B3d");
  console.log(`Adding attester: ${attesterAddress}`);
  const tx = await registry.setAttester(attesterAddress, true);
  await tx.wait();
  console.log("✓ Done");
}

main();
