import { useState } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { Overview } from "./pages/Overview";
import { Investor } from "./pages/Investor";
import { Issuer } from "./pages/Issuer";
import { Compliance } from "./pages/Compliance";
import "./App.css";

type Page = "overview" | "investor" | "issuer" | "compliance";

// Contract addresses — set via env or hardcoded for demo
const ADDRESSES = {
  attesterRegistry: import.meta.env.VITE_ATTESTER_REGISTRY || "",
  registry: import.meta.env.VITE_REGISTRY || "",
  policy: import.meta.env.VITE_POLICY || "",
  gate: import.meta.env.VITE_GATE || "",
  token: import.meta.env.VITE_TOKEN || "",
  attesterUrl: import.meta.env.VITE_ATTESTER_URL || "https://api.attestrail.com",
};

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState("");

  async function connect() {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }
    const provider = new BrowserProvider(window.ethereum);
    const s = await provider.getSigner();
    const addr = await s.getAddress();
    const net = await provider.getNetwork();
    setSigner(s);
    setAccount(addr);
    setNetwork(net.name === "unknown" ? `Chain ${net.chainId}` : net.name);
  }

  return (
    <div className="app">
      <header>
        <img src="/logo.png" alt="AttestRail" className="header-logo" />
        <h1>AttestRail</h1>
        <nav>
          <button className={page === "overview" ? "active" : ""} onClick={() => setPage("overview")}>
            Overview
          </button>
          <button className={page === "investor" ? "active" : ""} onClick={() => setPage("investor")}>
            Investor
          </button>
          <button className={page === "issuer" ? "active" : ""} onClick={() => setPage("issuer")}>
            Issuer
          </button>
          <button className={page === "compliance" ? "active" : ""} onClick={() => setPage("compliance")}>
            Compliance
          </button>
        </nav>
        <div className="wallet">
          {account ? (
            <span>
              {account.slice(0, 6)}...{account.slice(-4)} ({network})
            </span>
          ) : (
            <button onClick={connect}>Connect Wallet</button>
          )}
        </div>
      </header>

      <main>
        {page === "overview" && (
          <Overview
            addresses={ADDRESSES}
            account={account}
            network={network}
            onConnect={connect}
            onNavigate={(p) => setPage(p as Page)}
          />
        )}
        {page === "investor" && (
          <Investor signer={signer} addresses={ADDRESSES} account={account} onConnect={connect} />
        )}
        {page === "issuer" && <Issuer signer={signer} addresses={ADDRESSES} account={account} onConnect={connect} />}
        {page === "compliance" && (
          <Compliance signer={signer} addresses={ADDRESSES} account={account} onConnect={connect} />
        )}
      </main>
    </div>
  );
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
