import { ethers, fhevm } from "hardhat";

// Publicly decrypts the eligible bit of one or more checks. The bit must
// already be publicly decryptable (requestPublicDecryption called).
//
// Usage:
//   CHECK_IDS=0xabc...,0xdef... npx hardhat run scripts/decrypt-eligible.ts --network sepolia

const GATE_ADDR = "0x803Fc2767028b2fA9B117BE802F1333818D9929d";

async function main() {
  try {
    await fhevm.initializeCLIApi();
  } catch {
    // already initialized
  }

  const ids = (process.env.CHECK_IDS || "").split(",").filter(Boolean);
  if (ids.length === 0) {
    console.error("Set CHECK_IDS=0x...,0x...");
    process.exit(1);
  }

  const gate = await ethers.getContractAt("PrivateEligibilityGate", GATE_ADDR);

  for (const id of ids) {
    const handle = await gate.getEncryptedEligible(id);
    const eligible = await fhevm.publicDecryptEbool(handle);
    const [, , , amount, , , consumed] = await gate.getCheck(id);
    console.log(`${id}`);
    console.log(`  amount=${amount}  eligible=${eligible}  consumed=${consumed}`);
  }
}

main().catch(console.error);
