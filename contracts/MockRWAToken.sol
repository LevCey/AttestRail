// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {PrivateEligibilityGate} from "./PrivateEligibilityGate.sol";

/// @title MockRWAToken — FHE-aware mock ledger with euint64 balances
contract MockRWAToken is ZamaEthereumConfig {
    PrivateEligibilityGate public immutable gate;
    address public immutable issuer;
    mapping(address => euint64) internal balances;

    error OnlyIssuer();
    error CheckNotFound();
    error CheckConsumed();
    error CheckParamMismatch();

    event TransferExecuted(bytes32 indexed checkId, address indexed from, address indexed to, uint64 amount);
    event Minted(address indexed to, uint64 amount);

    constructor(PrivateEligibilityGate _gate, address _issuer, uint64 initialMint) {
        gate = _gate;
        issuer = _issuer;
        if (initialMint > 0) {
            balances[_issuer] = FHE.asEuint64(initialMint);
            FHE.allowThis(balances[_issuer]);
            FHE.allow(balances[_issuer], _issuer);
        }
    }

    function mint(address to, uint64 amount) external {
        if (msg.sender != issuer) revert OnlyIssuer();
        euint64 amountEnc = FHE.asEuint64(amount);
        if (FHE.isInitialized(balances[to])) {
            balances[to] = FHE.add(balances[to], amountEnc);
        } else {
            balances[to] = amountEnc;
        }
        FHE.allowThis(balances[to]);
        FHE.allow(balances[to], to);
        emit Minted(to, amount);
    }

    function gatedTransfer(address to, uint64 amount, bytes32 checkId) external {
        // Read check from gate
        (address user, , address checkTo, uint64 checkAmount, , , bool consumed, bool exists) = gate.getCheck(checkId);

        if (!exists) revert CheckNotFound();
        if (consumed) revert CheckConsumed();
        if (user != msg.sender || checkTo != to || checkAmount != amount) revert CheckParamMismatch();

        // FHE-native enforcement
        ebool eligible = gate.getEncryptedEligible(checkId);
        euint64 effectiveAmount = FHE.select(eligible, FHE.asEuint64(amount), FHE.asEuint64(0));

        // Update encrypted balances
        balances[msg.sender] = FHE.sub(balances[msg.sender], effectiveAmount);
        FHE.allowThis(balances[msg.sender]);
        FHE.allow(balances[msg.sender], msg.sender);

        if (FHE.isInitialized(balances[to])) {
            balances[to] = FHE.add(balances[to], effectiveAmount);
        } else {
            balances[to] = effectiveAmount;
        }
        FHE.allowThis(balances[to]);
        FHE.allow(balances[to], to);

        // Mark consumed
        gate.markConsumed(checkId);

        emit TransferExecuted(checkId, msg.sender, to, amount);
    }

    function getBalanceHandle(address owner) external view returns (euint64) {
        return balances[owner];
    }
}
