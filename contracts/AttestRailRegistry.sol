// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, externalEbool, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AttesterRegistry} from "./AttesterRegistry.sol";

/// @title AttestRailRegistry — encrypted profile storage with EIP-712 attester verification
contract AttestRailRegistry is ZamaEthereumConfig, EIP712("AttestRail", "1") {
    struct Attestation {
        address user;
        bytes32 handlesDigest;
        uint64 expiry;
        uint256 nonce;
    }

    struct EncryptedProfile {
        ebool kycVerified;
        ebool jurisdictionAllowed;
        ebool sanctionsFlag;
        euint8 riskTier;
        euint64 currentExposure;
        address attester;
        uint64 attestationExpiry;
        bool exists;
    }

    bytes32 public constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(address user,bytes32 handlesDigest,uint64 expiry,uint256 nonce)");

    AttesterRegistry public immutable attesterRegistry;
    address public registryAdmin;
    address public gateContract;
    mapping(address => EncryptedProfile) internal profiles;

    error UserMismatch();
    error AttestationExpired();
    error DigestMismatch();
    error AttesterNotApproved();
    error ProfileNotFound();
    error NotAdmin();
    error UnknownField();

    event ProfileSubmitted(address indexed user, address indexed attester, uint64 expiry);
    event DisclosureGranted(address indexed user, address indexed officer, uint8 indexed fieldId);

    constructor(AttesterRegistry _attesterRegistry, address _admin) {
        attesterRegistry = _attesterRegistry;
        registryAdmin = _admin;
    }

    function setGateContract(address _gate) external {
        if (msg.sender != registryAdmin) revert NotAdmin();
        gateContract = _gate;
    }

    function submitProfile(
        externalEbool kycVerified,
        externalEbool jurisdictionAllowed,
        externalEbool sanctionsFlag,
        externalEuint8 riskTier,
        externalEuint64 currentExposure,
        bytes calldata inputProof,
        Attestation calldata attestation,
        bytes calldata attesterSignature
    ) external {
        // 1. Verify attestation.user == msg.sender
        if (attestation.user != msg.sender) revert UserMismatch();

        // 2. Verify expiry
        if (attestation.expiry < block.timestamp) revert AttestationExpired();

        // 3. Verify handle digest
        bytes32 expectedDigest = keccak256(
            abi.encodePacked(
                externalEbool.unwrap(kycVerified),
                externalEbool.unwrap(jurisdictionAllowed),
                externalEbool.unwrap(sanctionsFlag),
                externalEuint8.unwrap(riskTier),
                externalEuint64.unwrap(currentExposure)
            )
        );
        if (attestation.handlesDigest != expectedDigest) revert DigestMismatch();

        // 4. Recover signer via EIP-712 and verify approved
        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                attestation.user,
                attestation.handlesDigest,
                attestation.expiry,
                attestation.nonce
            )
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), attesterSignature);
        if (!attesterRegistry.isApproved(signer)) revert AttesterNotApproved();

        // 5. Consume nonce (reverts with NonceReused if already used)
        attesterRegistry.consumeNonce(attestation.nonce);

        // 6. Convert external inputs and store profile
        EncryptedProfile storage p = profiles[msg.sender];
        p.kycVerified = FHE.fromExternal(kycVerified, inputProof);
        p.jurisdictionAllowed = FHE.fromExternal(jurisdictionAllowed, inputProof);
        p.sanctionsFlag = FHE.fromExternal(sanctionsFlag, inputProof);
        p.riskTier = FHE.fromExternal(riskTier, inputProof);
        p.currentExposure = FHE.fromExternal(currentExposure, inputProof);

        // 7. Grant ACL: contract + user + gate
        FHE.allowThis(p.kycVerified);
        FHE.allow(p.kycVerified, msg.sender);
        FHE.allowThis(p.jurisdictionAllowed);
        FHE.allow(p.jurisdictionAllowed, msg.sender);
        FHE.allowThis(p.sanctionsFlag);
        FHE.allow(p.sanctionsFlag, msg.sender);
        FHE.allowThis(p.riskTier);
        FHE.allow(p.riskTier, msg.sender);
        FHE.allowThis(p.currentExposure);
        FHE.allow(p.currentExposure, msg.sender);

        if (gateContract != address(0)) {
            FHE.allow(p.kycVerified, gateContract);
            FHE.allow(p.jurisdictionAllowed, gateContract);
            FHE.allow(p.sanctionsFlag, gateContract);
            FHE.allow(p.riskTier, gateContract);
            FHE.allow(p.currentExposure, gateContract);
        }

        p.attester = signer;
        p.attestationExpiry = attestation.expiry;
        p.exists = true;

        emit ProfileSubmitted(msg.sender, signer, attestation.expiry);
    }

    function getProfile(
        address user
    )
        external
        view
        returns (
            ebool kycVerified,
            ebool jurisdictionAllowed,
            ebool sanctionsFlag,
            euint8 riskTier,
            euint64 currentExposure,
            address attester,
            uint64 attestationExpiry,
            bool exists
        )
    {
        EncryptedProfile storage p = profiles[user];
        return (
            p.kycVerified,
            p.jurisdictionAllowed,
            p.sanctionsFlag,
            p.riskTier,
            p.currentExposure,
            p.attester,
            p.attestationExpiry,
            p.exists
        );
    }

    function profileExists(address user) external view returns (bool) {
        return profiles[user].exists;
    }

    function getAttestationExpiry(address user) external view returns (uint64) {
        return profiles[user].attestationExpiry;
    }

    /// @notice Selective disclosure: admin grants FHE.allow on a specific field to an officer
    function grantDisclosure(address user, address officer, uint8 fieldId) external {
        if (msg.sender != registryAdmin) revert NotAdmin();
        if (!profiles[user].exists) revert ProfileNotFound();

        if (fieldId == 0) {
            FHE.allow(profiles[user].currentExposure, officer);
        } else if (fieldId == 1) {
            FHE.allow(profiles[user].riskTier, officer);
        } else {
            revert UnknownField();
        }

        emit DisclosureGranted(user, officer, fieldId);
    }
}
