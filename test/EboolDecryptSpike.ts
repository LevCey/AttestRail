import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";

use(chaiAsPromised);

describe("Spike S1 — ebool + public decryption", function () {
  let deployer: HardhatEthersSigner;
  let contractAddress: string;
  let contract: Awaited<ReturnType<typeof deploySpike>>;

  async function deploySpike() {
    const factory = await ethers.getContractFactory("EboolDecryptSpike");
    const c = await factory.deploy();
    return c;
  }

  before(async function () {
    [deployer] = await ethers.getSigners();
  });

  beforeEach(async function () {
    contract = await deploySpike();
    contractAddress = await contract.getAddress();
  });

  describe("Path A: trivial encrypt → public decrypt", function () {
    it("stores true, requests public decryption, reads true", async function () {
      // 1. Store a trivially encrypted `true`
      await (await contract.storeFromPlaintext(true)).wait();

      // 2. Request public decryption
      await (await contract.requestPublicDecryption()).wait();

      // 3. Read the handle and decrypt publicly
      const handle = await contract.getHandle();
      const result = await fhevm.publicDecryptEbool(handle);

      expect(result).to.equal(true);
    });

    it("stores false, requests public decryption, reads false", async function () {
      await (await contract.storeFromPlaintext(false)).wait();
      await (await contract.requestPublicDecryption()).wait();

      const handle = await contract.getHandle();
      const result = await fhevm.publicDecryptEbool(handle);

      expect(result).to.equal(false);
    });
  });

  describe("Path B: encrypted input → public decrypt", function () {
    it("encrypts true off-chain, stores, requests public decryption, reads true", async function () {
      // 1. Encrypt `true` off-chain
      const encrypted = await fhevm
        .createEncryptedInput(contractAddress, deployer.address)
        .addBool(true)
        .encrypt();

      // 2. Store via fromExternal
      await (
        await contract.storeFromInput(encrypted.handles[0], encrypted.inputProof)
      ).wait();

      // 3. Request public decryption
      await (await contract.requestPublicDecryption()).wait();

      // 4. Read and verify
      const handle = await contract.getHandle();
      const result = await fhevm.publicDecryptEbool(handle);

      expect(result).to.equal(true);
    });
  });

  describe("Path C: user decrypt requires FHE.allow (ACL difference)", function () {
    it("user decrypt FAILS without FHE.allow — confirms ACL requirement", async function () {
      // storeFromInput does allowThis but NOT allow(deployer)
      const encrypted = await fhevm
        .createEncryptedInput(contractAddress, deployer.address)
        .addBool(true)
        .encrypt();

      await (
        await contract.storeFromInput(encrypted.handles[0], encrypted.inputProof)
      ).wait();

      const handle = await contract.getHandle();

      // This should fail: user decrypt needs FHE.allow(handle, user)
      await expect(
        fhevm.userDecryptEbool(handle, contractAddress, deployer),
      ).to.be.rejectedWith("not authorized");
    });

    it("public decrypt SUCCEEDS without FHE.allow — only needs makePubliclyDecryptable", async function () {
      const encrypted = await fhevm
        .createEncryptedInput(contractAddress, deployer.address)
        .addBool(true)
        .encrypt();

      await (
        await contract.storeFromInput(encrypted.handles[0], encrypted.inputProof)
      ).wait();

      await (await contract.requestPublicDecryption()).wait();

      const handle = await contract.getHandle();
      const result = await fhevm.publicDecryptEbool(handle);

      // Public decrypt works with only allowThis + makePubliclyDecryptable
      expect(result).to.equal(true);
    });
  });
});
