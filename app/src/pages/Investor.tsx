import { useState } from "react";
import { JsonRpcSigner, ethers } from "ethers";

interface Props {
  signer: JsonRpcSigner | null;
  addresses: Record<string, string>;
  account: string;
  onConnect?: () => void;
}

export function Investor({ signer, addresses, account, onConnect }: Props) {
  const [kyc, setKyc] = useState(true);
  const [jurisdiction, setJurisdiction] = useState(true);
  const [sanctions, setSanctions] = useState(false);
  const [riskTier, setRiskTier] = useState(1);
  const [exposure, setExposure] = useState(5000);
  const [transferAmount, setTransferAmount] = useState(10000);
  const [recipient, setRecipient] = useState("");
  const [policyId, setPolicyId] = useState(0);
  const [checkId, setCheckId] = useState("");
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function requestAttestation() {
    if (!signer) return;
    addLog("Requesting attestation from attester service...");
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
      if (data.mode === "encrypt-first") {
        addLog(`✓ Attester is live — EIP-712 signer ready (${data.attester ? String(data.attester).slice(0, 10) + "..." : "ok"}).`);
        addLog(
          "Fresh-profile onboarding runs through the attester service, which encrypts attributes before signing. " +
            "This demo uses a pre-provisioned investor profile — continue with step 2 below.",
        );
      } else {
        addLog(`Attester response: ${JSON.stringify(data).slice(0, 200)}...`);
      }
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
      if (!id) {
        addLog("Error: EligibilityCheckCreated event not found in the receipt. Check that your wallet is on Sepolia.");
        return;
      }
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
      addLog("✓ Public decryption requested — the eligible bit is now publicly decryptable.");

      const handle = await gate.getEncryptedEligible(checkId);
      if (handle && handle !== ethers.ZeroHash) {
        addLog(`Eligible handle: ${String(handle).slice(0, 18)}... (readable via Zama Relayer SDK)`);
        addLog("On-chain enforcement via FHE.select does NOT depend on this read — proceed to Execute Transfer.");
      }
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    }
  }

  async function executeTransfer() {
    if (!signer || !checkId || !addresses.token) return;
    addLog(`Executing gated transfer: to=${recipient}, amount=${transferAmount}`);
    try {
      const token = new ethers.Contract(addresses.token, ["function gatedTransfer(address,uint64,bytes32)"], signer);
      const tx = await token.gatedTransfer(recipient, transferAmount, checkId);
      await tx.wait();
      addLog("Transfer executed — amount applied via FHE.select.");
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <section>
      <div className="page-header">
        <h2>Investor</h2>
        <p className="page-desc">
          Submit an encrypted compliance profile, run an <code className="zama">Zama FHE</code> eligibility check, and
          execute a gated transfer — all enforced on-chain via encrypted state.
        </p>
      </div>

      {!signer && (
        <div className="card connect-cta">
          <h3
            style={{
              textTransform: "none",
              letterSpacing: "normal",
              fontSize: "1.05rem",
              color: "var(--text-primary)",
            }}
          >
            Connect a wallet to start the investor flow
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0.5rem 0 1rem" }}>
            Use a Sepolia wallet to request an attestation, submit an encrypted compliance profile, create an
            eligibility check, and execute an FHE-gated transfer.
          </p>
          {onConnect && <button onClick={onConnect}>Connect Wallet</button>}
          <div style={{ marginTop: "1.25rem", textAlign: "left", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text-secondary)" }}>Available after connection:</strong>
            <ol style={{ marginTop: "0.4rem", paddingLeft: "1.2rem", lineHeight: "1.8" }}>
              <li>Set demo compliance attributes</li>
              <li>Request attester EIP-712 signature</li>
              <li>Create FHE eligibility check</li>
              <li>Request public decryption (UI visibility)</li>
              <li>Execute FHE.select-gated transfer</li>
            </ol>
          </div>
        </div>
      )}

      {signer && (
        <>
          <div className="form-group">
            <h3>1. Investor Attributes</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.25rem 0 0.75rem" }}>
              In production these are verified and signed by the attester — editable here for demo purposes.
            </p>
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
            <button onClick={requestAttestation}>Request Attester Signature</button>
          </div>

          <div className="form-group">
            <h3>2. Eligibility Check</h3>
            <label>
              Policy ID: <input type="number" value={policyId} onChange={(e) => setPolicyId(+e.target.value)} />
              <small style={{ marginLeft: "0.5rem", color: "var(--text-muted)" }}>Default demo policy: 0</small>
            </label>
            <label>
              Recipient:{" "}
              <input type="text" value={recipient} placeholder="0x..." onChange={(e) => setRecipient(e.target.value)} />
            </label>
            <small style={{ color: "var(--text-muted)" }}>Use any Sepolia address for the demo recipient.</small>
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
            <button onClick={executeTransfer} disabled={!checkId}>
              Execute Transfer
            </button>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
              Transfer enforcement uses encrypted eligibility via FHE.select — the public decrypt result is for UI
              visibility only.
            </p>
          </div>
        </>
      )}

      {signer && log.length > 0 && (
        <div className="log">
          <h3>Activity Log</h3>
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </section>
  );
}
