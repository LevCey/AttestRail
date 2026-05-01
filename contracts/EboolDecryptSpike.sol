// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Spike S1 — ebool + public decryption reference pattern
/// @notice Minimal contract to confirm the exact flow for PrivateEligibilityGate
contract EboolDecryptSpike is ZamaEthereumConfig {
    ebool private _flag;

    event FlagStored(address indexed sender);
    event DecryptionRequested();

    /// @notice Store an encrypted bool from user input
    function storeFromInput(externalEbool inputHandle, bytes calldata inputProof) external {
        _flag = FHE.fromExternal(inputHandle, inputProof);
        FHE.allowThis(_flag);
        emit FlagStored(msg.sender);
    }

    /// @notice Store a trivially encrypted bool (no user input needed)
    function storeFromPlaintext(bool value) external {
        _flag = FHE.asEbool(value);
        FHE.allowThis(_flag);
        emit FlagStored(msg.sender);
    }

    /// @notice Request public decryption of the stored flag
    function requestPublicDecryption() external {
        FHE.makePubliclyDecryptable(_flag);
        emit DecryptionRequested();
    }

    /// @notice Returns the raw handle (bytes32) for off-chain decryption queries
    function getHandle() external view returns (ebool) {
        return _flag;
    }
}
