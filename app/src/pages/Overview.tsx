interface Props {
  addresses: Record<string, string>;
  account: string;
  network: string;
}

export function Overview({ addresses, account, network }: Props) {
  const contracts = Object.entries(addresses).filter(([, v]) => v && v.startsWith("0x"));

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
            <span className="stat-value">7</span>
            <span className="stat-label">FHE Types</span>
          </div>
          <div className="stat">
            <span className="stat-value">euint64</span>
            <span className="stat-label">Encrypted Balances</span>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-icon">🌐</span> Network
          </div>
          <div className="card-value">{network || <span className="muted">Not connected</span>}</div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-icon">👛</span> Wallet
          </div>
          <div className="card-value mono">
            {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : <span className="muted">Not connected</span>}
          </div>
        </div>
      </div>

      {/* Deployed Contracts */}
      {contracts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-icon">📋</span> Deployed Contracts
          </div>
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

      {/* Flow */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">⚡</span> Eligibility Flow
        </div>
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
              <strong>Gate</strong> evaluates eligibility over encrypted state (FHE)
            </div>
          </div>
          <div className="flow-step">
            <span className="step-num">5</span>
            <div>
              <strong>Token</strong> executes transfer via <code>FHE.select(eligible, amount, 0)</code>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
