import { useState } from "react";
import { JsonRpcSigner, ethers } from "ethers";

interface Props {
  signer: JsonRpcSigner | null;
  addresses: Record<string, string>;
  account: string;
}

export function Issuer({ signer, addresses, account }: Props) {
  const [maxExposure, setMaxExposure] = useState(100000);
  const [issuerCap, setIssuerCap] = useState(10000000);
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function createPolicy() {
    if (!signer || !addresses.policy) return;
    addLog("Creating policy... (requires encrypted input via Relayer SDK)");
    addLog(`maxExposure=${maxExposure}, issuerCap=${issuerCap}`);
    addLog("Note: In the full demo, thresholds are encrypted client-side before submission.");
    // In a real implementation, this would use the Relayer SDK to encrypt
    // the thresholds before calling createPolicy on-chain.
    addLog("Policy creation requires Relayer SDK integration (Sepolia).");
  }

  return (
    <section>
      <h2>Issuer</h2>
      <p>Connected as: {account || "Not connected"}</p>

      <div className="form-group">
        <h3>Create Policy</h3>
        <label>
          Max Exposure (per user):{" "}
          <input type="number" value={maxExposure} onChange={(e) => setMaxExposure(+e.target.value)} />
        </label>
        <label>
          Issuer Exposure Cap:{" "}
          <input type="number" value={issuerCap} onChange={(e) => setIssuerCap(+e.target.value)} />
        </label>
        <p>
          <small>KYC Required: ✅ | Jurisdiction Required: ✅ | Block Sanctioned: ✅ | Max Risk Tier: 3</small>
        </p>
        <button onClick={createPolicy} disabled={!signer}>
          Create Policy
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
