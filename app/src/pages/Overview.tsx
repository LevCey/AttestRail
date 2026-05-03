interface Props {
  addresses: Record<string, string>;
  account: string;
  network: string;
}

export function Overview({ addresses, account, network }: Props) {
  return (
    <section>
      <h2>Overview</h2>
      <p>
        AttestRail is a confidential compliance attestation layer for institutional onchain finance. This demo walks
        through the full eligibility flow using Zama FHEVM encrypted state.
      </p>

      <h3>Network</h3>
      <p>{network || "Not connected"}</p>

      <h3>Connected Wallet</h3>
      <p>{account || "Not connected"}</p>

      <h3>Deployed Contracts</h3>
      <table>
        <tbody>
          {Object.entries(addresses)
            .filter(([, v]) => v && v.startsWith("0x"))
            .map(([name, addr]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>
                  <code>{addr}</code>
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <h3>Flow</h3>
      <ol>
        <li>
          <strong>Issuer</strong> creates a policy with encrypted thresholds
        </li>
        <li>
          <strong>Investor</strong> requests attestation from mock attester
        </li>
        <li>
          <strong>Investor</strong> submits signed encrypted profile
        </li>
        <li>
          <strong>Investor</strong> creates eligibility check (FHE computation)
        </li>
        <li>
          <strong>Anyone</strong> requests public decryption (UI visibility)
        </li>
        <li>
          <strong>Investor</strong> executes gated transfer (FHE.select enforcement)
        </li>
      </ol>
    </section>
  );
}
