import { useState } from "react";
import { JsonRpcSigner } from "ethers";

interface Props {
  signer: JsonRpcSigner | null;
  addresses: Record<string, string>;
  account: string;
  onConnect?: () => void;
}

export function Issuer({ signer, addresses, onConnect }: Props) {
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
    addLog("Note: Thresholds are encrypted client-side before on-chain submission.");
    addLog("→ Policy creation requires Zama Relayer SDK browser bundle (Sepolia).");
  }

  return (
    <section>
      <div className="page-header">
        <h2>Issuer Dashboard</h2>
        <p className="page-desc">
          Define encrypted compliance policies. Exposure thresholds are stored as <code className="zama">euint64</code>{" "}
          — competitors cannot see your limits.
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
            Connect a wallet to manage issuer policies
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0.5rem 0 1rem" }}>
            Use a Sepolia issuer wallet to create encrypted exposure thresholds, configure eligibility rules, and manage
            policy activation for the demo deployment.
          </p>
          {onConnect && <button onClick={onConnect}>Connect Wallet</button>}
          <div style={{ marginTop: "1.25rem", textAlign: "left", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text-secondary)" }}>Available after connection:</strong>
            <ol style={{ marginTop: "0.4rem", paddingLeft: "1.2rem", lineHeight: "1.8" }}>
              <li>Create encrypted max exposure threshold (euint64)</li>
              <li>Create encrypted issuer exposure cap (euint64)</li>
              <li>Configure KYC / jurisdiction / sanctions rules</li>
              <li>Set max risk tier</li>
            </ol>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1rem" }}>
            Note: Encrypted threshold submission requires Zama Relayer SDK integration.
          </p>
        </div>
      )}

      {signer && (
        <>
          <div className="form-group">
            <h3>Create Policy</h3>
            <label>
              Per-User Max Exposure (euint64):{" "}
              <input type="number" value={maxExposure} onChange={(e) => setMaxExposure(+e.target.value)} />
            </label>
            <label>
              Issuer-Wide Exposure Cap (euint64):{" "}
              <input type="number" value={issuerCap} onChange={(e) => setIssuerCap(+e.target.value)} />
            </label>
            <div style={{ marginTop: "0.75rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <strong>Public flags:</strong> KYC Required ✅ • Jurisdiction Required ✅ • Block Sanctioned ✅ • Max Risk
              Tier: 3
            </div>
            <button onClick={createPolicy}>Create Policy</button>
          </div>

          {log.length > 0 && (
            <div className="log">
              <h3>Activity</h3>
              {log.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
