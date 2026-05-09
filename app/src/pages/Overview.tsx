interface Props {
  addresses: Record<string, string>;
  account: string;
  network: string;
  onConnect?: () => void;
  onNavigate?: (page: string) => void;
}

export function Overview({ addresses, account, network, onConnect, onNavigate }: Props) {
  const contracts = Object.entries(addresses).filter(([, v]) => v && v.startsWith("0x"));
  const connected = !!account;

  return (
    <section className="overview">
      {/* Hero */}
      <div className="hero">
        <div className="hero-badge">Zama FHEVM • Sepolia Testnet</div>
        <h2>Private RWA Eligibility Gate</h2>
        <p className="hero-desc">
          Confidential compliance attestations for institutional onchain finance. All eligibility checks, policy
          thresholds, and token balances are encrypted. Transfer enforcement is FHE-native.
        </p>
        <div className="hero-stats">
          <div className="stat">
            <span className="stat-value">5</span>
            <span className="stat-label">Contracts</span>
          </div>
          <div className="stat">
            <span className="stat-value">25</span>
            <span className="stat-label">Tests Passing</span>
          </div>
          <div className="stat">
            <span className="stat-value">euint64</span>
            <span className="stat-label">Encrypted Balances</span>
          </div>
          <div className="stat">
            <span className="stat-value">FHE.select</span>
            <span className="stat-label">Transfer Gating</span>
          </div>
        </div>
      </div>

      {/* Connect Wallet CTA — only when disconnected */}
      {!connected && (
        <div className="card connect-cta">
          <h3
            style={{ textTransform: "none", letterSpacing: "normal", fontSize: "1.1rem", color: "var(--text-primary)" }}
          >
            Connect a wallet to run the demo
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", margin: "0.5rem 0 1rem" }}>
            The Sepolia deployment is visible below in read-only mode. Connect a wallet to create eligibility checks,
            request public decryption, and execute FHE-gated transfers.
          </p>
          {onConnect && <button onClick={onConnect}>Connect Wallet</button>}
        </div>
      )}

      {/* Connection Status — only when connected */}
      {connected && (
        <>
          <div className="grid-2">
            <div className="card">
              <div className="card-header">Network</div>
              <div className="card-value">
                {network === "sepolia" && <span style={{ color: "var(--success)", marginRight: "0.4rem" }}>●</span>}
                {network}
              </div>
            </div>
            <div className="card">
              <div className="card-header">Wallet</div>
              <div className="card-value mono">
                {account.slice(0, 6)}...{account.slice(-4)}
              </div>
            </div>
          </div>

          {/* Role-based next actions */}
          {onNavigate && (
            <div className="card">
              <div className="card-header">Continue as</div>
              <div className="role-actions">
                <button className="role-btn" onClick={() => onNavigate("investor")}>
                  <strong>Investor</strong>
                  <span>Submit profile & run eligibility check</span>
                </button>
                <button className="role-btn" onClick={() => onNavigate("issuer")}>
                  <strong>Issuer</strong>
                  <span>Create encrypted policy</span>
                </button>
                <button className="role-btn" onClick={() => onNavigate("compliance")}>
                  <strong>Compliance</strong>
                  <span>Grant selective disclosure</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Flow */}
      <div className="card">
        <div className="card-header">Eligibility Flow</div>
        <div className="flow-steps">
          <div className="flow-step">
            <span className="step-num">1</span>
            <div>
              <strong>Issuer</strong> creates policy with encrypted thresholds
            </div>
          </div>
          <div className="flow-step">
            <span className="step-num">2</span>
            <div>
              <strong>Attester</strong> signs encrypted compliance profile (EIP-712)
            </div>
          </div>
          <div className="flow-step">
            <span className="step-num">3</span>
            <div>
              <strong>Investor</strong> submits signed profile on-chain
            </div>
          </div>
          <div className="flow-step">
            <span className="step-num">4</span>
            <div>
              <strong>Gate</strong> evaluates eligibility over encrypted state
            </div>
          </div>
          <div className="flow-step">
            <span className="step-num">5</span>
            <div>
              <strong>Token</strong> executes transfer via <code className="zama">FHE.select(eligible, amount, 0)</code>
            </div>
          </div>
        </div>
      </div>

      {/* Deployed Contracts — secondary */}
      {contracts.length > 0 && (
        <div className="card">
          <div className="card-header">Deployed Contracts (Sepolia)</div>
          <div className="contracts-grid">
            {contracts.map(([name, addr]) => (
              <div key={name} className="contract-row">
                <span className="contract-name">{name}</span>
                <a
                  href={`https://sepolia.etherscan.io/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contract-addr"
                >
                  {addr.slice(0, 6)}...{addr.slice(-4)} ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
