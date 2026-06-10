import { useState } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { Overview } from "./pages/Overview";
import { Investor } from "./pages/Investor";
import { Issuer } from "./pages/Issuer";
import { Compliance } from "./pages/Compliance";
import "./App.css";

type Page = "overview" | "investor" | "issuer" | "compliance";

const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";

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
    let provider = new BrowserProvider(window.ethereum);
    let net = await provider.getNetwork();
    if (net.chainId !== SEPOLIA_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_CHAIN_HEX }],
        });
      } catch (e) {
        // 4902: chain not added to the wallet yet
        if ((e as { code?: number }).code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_HEX,
                chainName: "Sepolia",
                nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } else {
          alert("This demo runs on Sepolia testnet. Please switch networks in your wallet to continue.");
          return;
        }
      }
      provider = new BrowserProvider(window.ethereum);
      net = await provider.getNetwork();
      if (net.chainId !== SEPOLIA_CHAIN_ID) {
        alert("This demo runs on Sepolia testnet. Please switch networks in your wallet to continue.");
        return;
      }
    }
    const s = await provider.getSigner();
    const addr = await s.getAddress();
    setSigner(s);
    setAccount(addr);
    setNetwork("sepolia");
    window.ethereum.on("chainChanged", () => window.location.reload());
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
