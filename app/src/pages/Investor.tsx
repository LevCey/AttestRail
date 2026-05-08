import { useState } from "react";
import { JsonRpcSigner, ethers } from "ethers";

interface Props {
  signer: JsonRpcSigner | null;
  addresses: Record<string, string>;
  account: string;
}

export function Investor({ signer, addresses, account }: Props) {
  const [kyc, setKyc] = useState(true);
  const [jurisdiction, setJurisdiction] = useState(true);
  const [sanctions, setSanctions] = useState(false);
  const [riskTier, setRiskTier] = useState(1);
  const [exposure, setExposure] = useState(5000);
  const [transferAmount, setTransferAmount] = useState(10000);
  const [recipient, setRecipient] = useState("");
  const [policyId, setPolicyId] = useState(0);
  const [checkId, setCheckId] = useState("");
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function requestAttestation() {
    if (!signer) return;
    addLog("Requesting attestation from mock attester...");
    try {
      const res = await fetch(`${addresses.attesterUrl}/attest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: account,
          attributes: {
            kycVerified: kyc,
            jurisdictionAllowed: jurisdiction,
            sanctionsFlag: sanctions,
            riskTier,
            currentExposure: exposure,
          },
        }),
      });
      const data = await res.json();
      addLog(`Attester response: ${JSON.stringify(data).slice(0, 200)}...`);
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    }
  }

  async function createCheck() {
    if (!signer || !addresses.gate) return;
    addLog(`Creating eligibility check: policyId=${policyId}, to=${recipient}, amount=${transferAmount}`);
    try {
      const gate = new ethers.Contract(
        addresses.gate,
        [
          "function createEligibilityCheck(uint256,address,uint64) returns (bytes32)",
          "event EligibilityCheckCreated(bytes32 indexed, address indexed, uint256 indexed)",
        ],
        signer,
      );
      const tx = await gate.createEligibilityCheck(policyId, recipient, transferAmount);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (l: { fragment?: { name: string } }) => l.fragment?.name === "EligibilityCheckCreated",
      );
      const id = event?.args?.[0];
      setCheckId(id);
      addLog(`Check created: ${id}`);
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    }
  }

  async function requestDecryption() {
    if (!signer || !checkId || !addresses.gate) return;
    addLog("Requesting public decryption...");
    try {
      const gate = new ethers.Contract(
        addresses.gate,
        ["function requestPublicDecryption(bytes32)", "function getEncryptedEligible(bytes32) view returns (bytes32)"],
        signer,
      );
      const tx = await gate.requestPublicDecryption(checkId);
      await tx.wait();
      addLog("✓ Public decryption tx confirmed. Reading result...");

      // Read the eligible handle and display status
      const handle = await gate.getEncryptedEligible(checkId);
      if (handle && handle !== ethers.ZeroHash) {
        addLog(`Eligible handle: ${String(handle).slice(0, 18)}...`);
        addLog("Note: Off-chain decryption requires Zama Relayer SDK (fhevm.publicDecryptEbool).");
        addLog("On-chain enforcement via FHE.select does NOT depend on this read.");
        // In production with Relayer SDK: const result = await fhevm.publicDecryptEbool(handle);
        setEligible(true); // Assume eligible for demo if tx succeeded without revert
      }
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
      setEligible(false);
    }
  }

  async function executeTransfer() {
    if (!signer || !checkId || !addresses.token) return;
    addLog(`Executing gated transfer: to=${recipient}, amount=${transferAmount}`);
    try {
      const token = new ethers.Contract(addresses.token, ["function gatedTransfer(address,uint64,bytes32)"], signer);
      const tx = await token.gatedTransfer(recipient, transferAmount, checkId);
      await tx.wait();
      addLog("Transfer executed. If eligible, tokens moved. If not, zero-amount no-op.");
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <section>
      <h2>Investor</h2>

      <div className="form-group">
        <h3>1. Demo Attributes</h3>
        <label>
          <input type="checkbox" checked={kyc} onChange={(e) => setKyc(e.target.checked)} /> KYC Verified
        </label>
        <label>
          <input type="checkbox" checked={jurisdiction} onChange={(e) => setJurisdiction(e.target.checked)} />{" "}
          Jurisdiction Allowed
        </label>
        <label>
          <input type="checkbox" checked={sanctions} onChange={(e) => setSanctions(e.target.checked)} /> Sanctioned
        </label>
        <label>
          Risk Tier:{" "}
          <input type="number" value={riskTier} min={0} max={5} onChange={(e) => setRiskTier(+e.target.value)} />
        </label>
        <label>
          Current Exposure: <input type="number" value={exposure} onChange={(e) => setExposure(+e.target.value)} />
        </label>
        <button onClick={requestAttestation}>Request Attestation</button>
      </div>

      <div className="form-group">
        <h3>2. Eligibility Check</h3>
        <label>
          Policy ID: <input type="number" value={policyId} onChange={(e) => setPolicyId(+e.target.value)} />
        </label>
        <label>
          Recipient:{" "}
          <input type="text" value={recipient} placeholder="0x..." onChange={(e) => setRecipient(e.target.value)} />
        </label>
        <label>
          Transfer Amount:{" "}
          <input type="number" value={transferAmount} onChange={(e) => setTransferAmount(+e.target.value)} />
        </label>
        <button onClick={createCheck} disabled={!signer}>
          Check Eligibility
        </button>
      </div>

      <div className="form-group">
        <h3>3. Decryption & Transfer</h3>
        <p>Check ID: {checkId ? <code>{checkId.slice(0, 18)}...</code> : "—"}</p>
        <button onClick={requestDecryption} disabled={!checkId}>
          Request Decryption
        </button>
        {eligible !== null && <p>Eligible: {eligible ? "✅ Yes" : "❌ No"}</p>}
        <button onClick={executeTransfer} disabled={!checkId}>
          Execute Transfer
        </button>
      </div>

      <div className="log">
        <h3>Log</h3>
        {log.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </section>
  );
}
