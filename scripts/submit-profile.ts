import { ethers, fhevm } from "hardhat";
import "dotenv/config";

async function main() {
  const [signer] = await ethers.getSigners();
  const registryAddr = "0x7275f7FBa4Fa3049054302C27E52F68A34a69000";

  // Init fhevm for Sepolia
  try {
    await fhevm.initializeCLIApi();
  } catch {
    // already initialized
  }

  console.log(`Submitting profile for ${signer.address}...`);

  // Encrypt attributes
  const encrypted = await fhevm
    .createEncryptedInput(registryAddr, signer.address)
    .addBool(true) // kycVerified
    .addBool(true) // jurisdictionAllowed
    .addBool(false) // sanctionsFlag
    .add8(1) // riskTier
    .add64(5000) // currentExposure
    .encrypt();

  // Compute digest
  const digest = ethers.keccak256(ethers.concat(encrypted.handles));
  const expiry = Math.floor(Date.now() / 1000) + 30 * 86400; // 30 days — must cover the demo/review window
  const nonce = BigInt(ethers.hexlify(ethers.randomBytes(32)));

  // Sign attestation (deployer is also attester in this setup)
  const attesterKey = process.env.ATTESTER_PRIVATE_KEY!;
  const attesterWallet = new ethers.Wallet(attesterKey);

  const domain = {
    name: "AttestRail",
    version: "1",
    chainId: 11155111,
    verifyingContract: registryAddr,
  };
  const types = {
    Attestation: [
      { name: "user", type: "address" },
      { name: "handlesDigest", type: "bytes32" },
      { name: "expiry", type: "uint64" },
      { name: "nonce", type: "uint256" },
    ],
  };
  const attestation = { user: signer.address, handlesDigest: digest, expiry, nonce };
  const signature = await attesterWallet.signTypedData(domain, types, attestation);

  // Submit
  const registry = await ethers.getContractAt("AttestRailRegistry", registryAddr);
  const tx = await registry.submitProfile(
    encrypted.handles[0],
    encrypted.handles[1],
    encrypted.handles[2],
    encrypted.handles[3],
    encrypted.handles[4],
    encrypted.inputProof,
    attestation,
    signature,
  );
  const receipt = await tx.wait();
  console.log(`✓ Profile submitted. Tx: ${receipt!.hash}`);
}

main().catch(console.error);
