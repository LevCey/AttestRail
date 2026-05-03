import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

// --- Types ---
type Contracts = {
  attesterRegistry: Awaited<ReturnType<typeof deploy>>["attesterRegistry"];
  registry: Awaited<ReturnType<typeof deploy>>["registry"];
  policy: Awaited<ReturnType<typeof deploy>>["policy"];
  gate: Awaited<ReturnType<typeof deploy>>["gate"];
  token: Awaited<ReturnType<typeof deploy>>["token"];
};

type Signers = {
  admin: HardhatEthersSigner;
  issuer: HardhatEthersSigner;
  investor: HardhatEthersSigner;
  recipient: HardhatEthersSigner;
  attester: HardhatEthersSigner;
};

// --- Deploy helper ---
async function deploy(signers: Signers) {
  const AttesterRegistry = await ethers.getContractFactory("AttesterRegistry");
  const attesterRegistry = await AttesterRegistry.deploy(signers.admin.address);

  const AttestRailPolicy = await ethers.getContractFactory("AttestRailPolicy");
  const policy = await AttestRailPolicy.deploy();

  const AttestRailRegistry = await ethers.getContractFactory("AttestRailRegistry");
  const registry = await AttestRailRegistry.deploy(await attesterRegistry.getAddress(), signers.admin.address);

  const Gate = await ethers.getContractFactory("PrivateEligibilityGate");
  const gate = await Gate.deploy(await policy.getAddress(), await registry.getAddress());

  const Token = await ethers.getContractFactory("MockRWAToken");
  const token = await Token.deploy(await gate.getAddress(), signers.issuer.address, 1_000_000);

  // Post-deploy wiring
  await attesterRegistry.connect(signers.admin).setRegistryContract(await registry.getAddress());
  await attesterRegistry.connect(signers.admin).setAttester(signers.attester.address, true);
  await registry.connect(signers.admin).setGateContract(await gate.getAddress());
  await policy.setGateContract(await gate.getAddress());
  await gate.setTokenContract(await token.getAddress());

  return { attesterRegistry, registry, policy, gate, token };
}

// --- EIP-712 signing helper ---
async function signAttestation(
  attester: HardhatEthersSigner,
  registryAddress: string,
  attestation: { user: string; handlesDigest: string; expiry: number; nonce: bigint },
) {
  const domain = {
    name: "AttestRail",
    version: "1",
    chainId: 31337,
    verifyingContract: registryAddress,
  };
  const types = {
    Attestation: [
      { name: "user", type: "address" },
      { name: "handlesDigest", type: "bytes32" },
      { name: "expiry", type: "uint64" },
      { name: "nonce", type: "uint256" },
    ],
  };
  return attester.signTypedData(domain, types, attestation);
}

// --- Submit profile helper ---
async function submitProfile(
  contracts: Contracts,
  signers: Signers,
  attrs: { kyc: boolean; jurisdiction: boolean; sanctions: boolean; riskTier: number; exposure: number },
) {
  const registryAddr = await contracts.registry.getAddress();
  const encrypted = await fhevm
    .createEncryptedInput(registryAddr, signers.investor.address)
    .addBool(attrs.kyc)
    .addBool(attrs.jurisdiction)
    .addBool(attrs.sanctions)
    .add8(attrs.riskTier)
    .add64(attrs.exposure)
    .encrypt();

  const digest = ethers.keccak256(ethers.concat(encrypted.handles));
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const nonce = BigInt(ethers.hexlify(ethers.randomBytes(32)));

  const attestation = { user: signers.investor.address, handlesDigest: digest, expiry, nonce };
  const sig = await signAttestation(signers.attester, registryAddr, attestation);

  await contracts.registry
    .connect(signers.investor)
    .submitProfile(
      encrypted.handles[0],
      encrypted.handles[1],
      encrypted.handles[2],
      encrypted.handles[3],
      encrypted.handles[4],
      encrypted.inputProof,
      attestation,
      sig,
    );
}

// --- Create policy helper ---
async function createPolicy(contracts: Contracts, signers: Signers, maxExposure: number, issuerCap: number) {
  const policyAddr = await contracts.policy.getAddress();
  const encrypted = await fhevm
    .createEncryptedInput(policyAddr, signers.issuer.address)
    .add64(maxExposure)
    .add64(issuerCap)
    .encrypt();

  const tx = await contracts.policy
    .connect(signers.issuer)
    .createPolicy(true, true, true, 3, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof);
  await tx.wait();
  // policyId is 0 for the first policy
  return 0n;
}

// ============================================================
// TESTS
// ============================================================

function extractCheckId(receipt: ethers.TransactionReceipt): string {
  const log = receipt.logs.find(
    (l) => "fragment" in l && (l as ethers.EventLog).fragment?.name === "EligibilityCheckCreated",
  ) as ethers.EventLog;
  return log.args[0];
}

describe("AttestRail — Full Integration", function () {
  let signers: Signers;
  let contracts: Contracts;

  before(async function () {
    const s = await ethers.getSigners();
    signers = { admin: s[0], issuer: s[1], investor: s[2], recipient: s[3], attester: s[4] };
  });

  beforeEach(async function () {
    contracts = await deploy(signers);
  });

  // ---- ELIGIBLE PATH ----
  describe("Eligible path", function () {
    it("full flow: submit profile → create check → public decrypt → gated transfer", async function () {
      // 1. Submit eligible profile
      await submitProfile(contracts, signers, {
        kyc: true,
        jurisdiction: true,
        sanctions: false,
        riskTier: 1,
        exposure: 5000,
      });

      // 2. Create policy (maxExposure=100000, issuerCap=10000000)
      const policyId = await createPolicy(contracts, signers, 100_000, 10_000_000);

      // 3. Mint tokens to investor
      await contracts.token.connect(signers.issuer).mint(signers.investor.address, 50_000);

      // 4. Create eligibility check
      const tx = await contracts.gate
        .connect(signers.investor)
        .createEligibilityCheck(policyId, signers.recipient.address, 10_000);
      const receipt = await tx.wait();
      const checkId = extractCheckId(receipt!);

      // 5. Request public decryption (for UI)
      await contracts.gate.requestPublicDecryption(checkId);

      // 6. Read eligible bit off-chain
      const eligibleHandle = await contracts.gate.getEncryptedEligible(checkId);
      const isEligible = await fhevm.publicDecryptEbool(eligibleHandle);
      expect(isEligible).to.equal(true);

      // 7. Gated transfer
      await contracts.token.connect(signers.investor).gatedTransfer(signers.recipient.address, 10_000, checkId);

      // 8. Verify balances via decrypt
      const investorBal = await contracts.token.getBalanceHandle(signers.investor.address);
      const recipientBal = await contracts.token.getBalanceHandle(signers.recipient.address);

      const investorClear = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        investorBal,
        await contracts.token.getAddress(),
        signers.investor,
      );
      const recipientClear = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        recipientBal,
        await contracts.token.getAddress(),
        signers.recipient,
      );

      // investor had 50000, transferred 10000 → 40000
      expect(investorClear).to.equal(40_000n);
      expect(recipientClear).to.equal(10_000n);
    });
  });

  // ---- SANCTIONED BLOCKED ----
  describe("Sanctioned blocked", function () {
    it("sanctioned investor → eligible=false → zero-amount transfer", async function () {
      await submitProfile(contracts, signers, {
        kyc: true,
        jurisdiction: true,
        sanctions: true,
        riskTier: 1,
        exposure: 5000,
      });
      const policyId = await createPolicy(contracts, signers, 100_000, 10_000_000);
      await contracts.token.connect(signers.issuer).mint(signers.investor.address, 50_000);

      const tx = await contracts.gate
        .connect(signers.investor)
        .createEligibilityCheck(policyId, signers.recipient.address, 10_000);
      const receipt = await tx.wait();
      const checkId = extractCheckId(receipt!);

      await contracts.gate.requestPublicDecryption(checkId);
      const isEligible = await fhevm.publicDecryptEbool(await contracts.gate.getEncryptedEligible(checkId));
      expect(isEligible).to.equal(false);

      // Transfer executes but with zero effective amount
      await contracts.token.connect(signers.investor).gatedTransfer(signers.recipient.address, 10_000, checkId);

      const investorClear = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        await contracts.token.getBalanceHandle(signers.investor.address),
        await contracts.token.getAddress(),
        signers.investor,
      );
      expect(investorClear).to.equal(50_000n); // unchanged
    });
  });

  // ---- PER-USER CAP BLOCKED ----
  describe("Per-user exposure cap blocked", function () {
    it("exposure + amount > maxExposure → eligible=false", async function () {
      // currentExposure=90000, transferAmount=20000, maxExposure=100000 → 110000 > 100000
      await submitProfile(contracts, signers, {
        kyc: true,
        jurisdiction: true,
        sanctions: false,
        riskTier: 1,
        exposure: 90_000,
      });
      const policyId = await createPolicy(contracts, signers, 100_000, 10_000_000);

      const tx = await contracts.gate
        .connect(signers.investor)
        .createEligibilityCheck(policyId, signers.recipient.address, 20_000);
      const receipt = await tx.wait();
      const checkId = extractCheckId(receipt!);

      await contracts.gate.requestPublicDecryption(checkId);
      const isEligible = await fhevm.publicDecryptEbool(await contracts.gate.getEncryptedEligible(checkId));
      expect(isEligible).to.equal(false);
    });
  });

  // ---- AGGREGATE CAP BLOCKED ----
  describe("Aggregate cap blocked", function () {
    it("aggregate + amount > issuerCap → eligible=false", async function () {
      // issuerCap=15000, first check 10000 passes, second check 10000 should fail (20000 > 15000)
      await submitProfile(contracts, signers, {
        kyc: true,
        jurisdiction: true,
        sanctions: false,
        riskTier: 1,
        exposure: 0,
      });
      const policyId = await createPolicy(contracts, signers, 100_000, 15_000);

      // First check: 10000 — should pass
      const tx1 = await contracts.gate
        .connect(signers.investor)
        .createEligibilityCheck(policyId, signers.recipient.address, 10_000);
      const r1 = await tx1.wait();
      const checkId1 = extractCheckId(r1!);
      await contracts.gate.requestPublicDecryption(checkId1);
      expect(await fhevm.publicDecryptEbool(await contracts.gate.getEncryptedEligible(checkId1))).to.equal(true);

      // Second check: 10000 — aggregate would be 20000 > 15000
      const tx2 = await contracts.gate
        .connect(signers.investor)
        .createEligibilityCheck(policyId, signers.recipient.address, 10_000);
      const r2 = await tx2.wait();
      const checkId2 = extractCheckId(r2!);
      await contracts.gate.requestPublicDecryption(checkId2);
      expect(await fhevm.publicDecryptEbool(await contracts.gate.getEncryptedEligible(checkId2))).to.equal(false);
    });
  });

  // ---- TRANSFER GUARDS ----
  describe("Transfer guards", function () {
    it("double consumption → CheckConsumed", async function () {
      await submitProfile(contracts, signers, {
        kyc: true,
        jurisdiction: true,
        sanctions: false,
        riskTier: 1,
        exposure: 5000,
      });
      const policyId = await createPolicy(contracts, signers, 100_000, 10_000_000);
      await contracts.token.connect(signers.issuer).mint(signers.investor.address, 50_000);

      const tx = await contracts.gate
        .connect(signers.investor)
        .createEligibilityCheck(policyId, signers.recipient.address, 10_000);
      const receipt = await tx.wait();
      const checkId = extractCheckId(receipt!);

      await contracts.token.connect(signers.investor).gatedTransfer(signers.recipient.address, 10_000, checkId);

      await expect(
        contracts.token.connect(signers.investor).gatedTransfer(signers.recipient.address, 10_000, checkId),
      ).to.be.revertedWithCustomError(contracts.token, "CheckConsumed");
    });

    it("param mismatch → CheckParamMismatch", async function () {
      await submitProfile(contracts, signers, {
        kyc: true,
        jurisdiction: true,
        sanctions: false,
        riskTier: 1,
        exposure: 5000,
      });
      const policyId = await createPolicy(contracts, signers, 100_000, 10_000_000);
      await contracts.token.connect(signers.issuer).mint(signers.investor.address, 50_000);

      const tx = await contracts.gate
        .connect(signers.investor)
        .createEligibilityCheck(policyId, signers.recipient.address, 10_000);
      const receipt = await tx.wait();
      const checkId = extractCheckId(receipt!);

      // Wrong amount
      await expect(
        contracts.token.connect(signers.investor).gatedTransfer(signers.recipient.address, 99_999, checkId),
      ).to.be.revertedWithCustomError(contracts.token, "CheckParamMismatch");
    });
  });
});
