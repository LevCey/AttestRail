import { useState } from "react";
import { JsonRpcSigner, ethers } from "ethers";

interface Props {
  signer: JsonRpcSigner | null;
  addresses: Record<string, string>;
  account: string;
}

export function Compliance({ signer, addresses, account }: Props) {
  const [user, setUser] = useState("");
  const [fieldId, setFieldId] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function grantDisclosure() {
    if (!signer || !addresses.registry) return;
    addLog(`Granting disclosure: user=${user}, officer=${account}, fieldId=${fieldId}`);
    try {
      const registry = new ethers.Contract(
        addresses.registry,
        ["function grantDisclosure(address,address,uint8)"],
        signer,
      );
      const tx = await registry.grantDisclosure(user, account, fieldId);
      await tx.wait();
      addLog("Disclosure granted. You can now decrypt the field.");
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <section>
      <h2>Compliance Officer</h2>
      <p>Connected as: {account || "Not connected"}</p>

      <div className="form-group">
        <h3>Selective Disclosure</h3>
        <label>
          User Address: <input type="text" value={user} placeholder="0x..." onChange={(e) => setUser(e.target.value)} />
        </label>
        <label>
          Field:{" "}
          <select value={fieldId} onChange={(e) => setFieldId(+e.target.value)}>
            <option value={0}>currentExposure</option>
            <option value={1}>riskTier</option>
          </select>
        </label>
        <button onClick={grantDisclosure} disabled={!signer}>
          Grant Disclosure
        </button>
        <p>
          <small>Only the registry admin can grant disclosure. After granting, the officer can decrypt the field.</small>
        </p>
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
