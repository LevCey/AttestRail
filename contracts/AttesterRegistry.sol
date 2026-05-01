// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AttesterRegistry — approved attester set + nonce tracking
contract AttesterRegistry {
    address public admin;
    address public registryContract;

    mapping(address => bool) public approvedAttesters;
    mapping(uint256 => bool) public usedNonces;

    error OnlyAdmin();
    error OnlyRegistry();
    error NonceReused();
    error RegistryAlreadySet();

    event AttesterUpdated(address indexed attester, bool approved);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    function setRegistryContract(address _registry) external onlyAdmin {
        if (registryContract != address(0)) revert RegistryAlreadySet();
        registryContract = _registry;
    }

    function setAttester(address attester, bool approved) external onlyAdmin {
        approvedAttesters[attester] = approved;
        emit AttesterUpdated(attester, approved);
    }

    function isApproved(address attester) external view returns (bool) {
        return approvedAttesters[attester];
    }

    function consumeNonce(uint256 nonce) external {
        if (msg.sender != registryContract) revert OnlyRegistry();
        if (usedNonces[nonce]) revert NonceReused();
        usedNonces[nonce] = true;
    }
}
