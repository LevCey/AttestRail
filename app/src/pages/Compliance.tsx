import { useState } from "react";
import { JsonRpcSigner, ethers } from "ethers";

interface Props {
  signer: JsonRpcSigner | null;
  addresses: Record<string, string>;
  account: string;
  onConnect?: () => void;
}

export function Compliance({ signer, addresses, onConnect }: Props) {
  const [user, setUser] = useState("");
  const [fieldId, setFieldId] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function grantDisclosure() {
    if (!signer || !addresses.registry) return;
    addLog(`Granting FHE.allow: user=${user}, fieldId=${fieldId}`);
    try {
      const registry = new ethers.Contract(
        addresses.registry,
        ["function grantDisclosure(address,address,uint8)"],
        signer,
      );
      const tx = await registry.grantDisclosure(user, await signer.getAddress(), fieldId);
      await tx.wait();
      addLog("✓ Disclosure granted. Officer can now decrypt this field via userDecryptEuint64.");
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <section>
      <div className="page-header">
        <h2>Compliance Officer</h2>
        <p className="page-desc">
          Selective disclosure: the registry admin grants <code className="zama">FHE.allow</code> on specific encrypted
          fields to authorized officers. Only the granted field becomes decryptable — all other profile data remains
          encrypted.
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
            Connect a wallet to manage selective disclosures
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0.5rem 0 0.75rem" }}>
            Use the registry admin wallet to grant access to specific encrypted profile fields for authorized compliance
            officers.
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--warning)", margin: "0 0 1rem" }}>
            Required role: Registry Admin
          </p>
          {onConnect && <button onClick={onConnect}>Connect Wallet</button>}
          <div style={{ marginTop: "1.25rem", textAlign: "left", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text-secondary)" }}>Available after connection:</strong>
            <ol style={{ marginTop: "0.4rem", paddingLeft: "1.2rem", lineHeight: "1.8" }}>
              <li>Select user and encrypted field</li>
              <li>Grant FHE.allow to officer address</li>
              <li>Authorized officer decrypts the granted field off-chain</li>
            </ol>
            <p style={{ marginTop: "0.75rem" }}>
              <strong style={{ color: "var(--text-secondary)" }}>Supported fields:</strong> currentExposure, riskTier
            </p>
            <p style={{ marginTop: "0.5rem", fontStyle: "italic" }}>
              Note: Officer-side decryption requires the Zama user decrypt flow.
            </p>
          </div>
        </div>
      )}

      {signer && (
        <>
          <div className="form-group">
            <h3>Grant Selective Disclosure</h3>
            <label>
              Profile Owner Address:{" "}
              <input
                type="text"
                value={user}
                placeholder="0x..."
                onChange={(e) => setUser(e.target.value)}
                style={{ minWidth: "320px" }}
              />
            </label>
            <label>
              Encrypted Field:{" "}
              <select value={fieldId} onChange={(e) => setFieldId(+e.target.value)}>
                <option value={0}>currentExposure (euint64)</option>
                <option value={1}>riskTier (euint8)</option>
              </select>
            </label>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              ⚠️ FHE.allow grants are permanent — Zama's ACL has no revoke primitive. Grant carefully.
            </p>
            <button onClick={grantDisclosure}>Grant Disclosure</button>
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
