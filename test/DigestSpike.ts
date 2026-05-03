import { ethers, fhevm } from "hardhat";
import { expect } from "chai";

describe("Spike S2 — Handle Digest Verification", function () {
  it("off-chain keccak256(packed handles) == on-chain computeDigest", async function () {
    const [deployer] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("DigestSpike");
    const contract = await factory.deploy();
    const contractAddress = await contract.getAddress();

    // Encrypt a known set of attributes off-chain
    const encrypted = await fhevm
      .createEncryptedInput(contractAddress, deployer.address)
      .addBool(true) // kycVerified
      .addBool(true) // jurisdictionAllowed
      .addBool(false) // sanctionsFlag
      .add8(1) // riskTier
      .add64(10000) // currentExposure
      .encrypt();

    const handles = encrypted.handles;
    expect(handles.length).to.equal(5);

    // Off-chain digest: keccak256(abi.encodePacked(handle0, handle1, handle2, handle3, handle4))
    // Each handle is bytes32, so encodePacked is just concatenation
    const offChainDigest = ethers.keccak256(ethers.concat(handles));

    // On-chain digest
    const onChainDigest = await contract.computeDigest(handles[0], handles[1], handles[2], handles[3], handles[4]);

    expect(onChainDigest).to.equal(offChainDigest);
    console.log("    ✓ Digest match confirmed:", offChainDigest);
    console.log("    ✓ Handle count:", handles.length);
    console.log("    ✓ Handle[0] (kyc):", handles[0]);
  });
});
