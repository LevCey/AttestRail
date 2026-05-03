import { useState, useEffect } from "react";
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
  attesterUrl: import.meta.env.VITE_ATTESTER_URL || "http://localhost:3001",
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

  useEffect(() => {
    connect();
  }, []);

  return (
    <div className="app">
      <header>
        <h1>AttestRail Demo</h1>
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
        <div className="banner">
          ⚠️ The eligible/blocked bit is publicly decryptable by design. On-chain transfer enforcement is FHE-native.
          <a href="https://github.com/LevCey/AttestRail#disclosure-and-inference-exposure"> Learn more</a>
        </div>

        {page === "overview" && <Overview addresses={ADDRESSES} account={account} network={network} />}
        {page === "investor" && <Investor signer={signer} addresses={ADDRESSES} account={account} />}
        {page === "issuer" && <Issuer signer={signer} addresses={ADDRESSES} account={account} />}
        {page === "compliance" && <Compliance signer={signer} addresses={ADDRESSES} account={account} />}
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
