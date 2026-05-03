// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title AttestRailPolicy — issuer-owned policies with encrypted thresholds
contract AttestRailPolicy is ZamaEthereumConfig {
    struct Policy {
        address issuer;
        bool kycRequired;
        bool jurisdictionRequired;
        bool blockSanctioned;
        uint8 maxRiskTier;
        euint64 maxExposure;
        euint64 issuerExposureCap;
        bool active;
        bool exists;
    }

    uint256 public nextPolicyId;
    mapping(uint256 => Policy) internal policies;
    address public gateContract;

    error OnlyIssuer();
    error PolicyNotFound();
    error OnlyAdmin();

    event PolicyCreated(uint256 indexed policyId, address indexed issuer);
    event PolicyExposureUpdated(uint256 indexed policyId);
    event PolicyActiveToggled(uint256 indexed policyId, bool active);

    function setGateContract(address _gate) external {
        gateContract = _gate;
    }

    function createPolicy(
        bool kycRequired,
        bool jurisdictionRequired,
        bool blockSanctioned,
        uint8 maxRiskTier,
        externalEuint64 inputMaxExposure,
        externalEuint64 inputIssuerCap,
        bytes calldata inputProof
    ) external returns (uint256 policyId) {
        policyId = nextPolicyId++;
        Policy storage p = policies[policyId];
        p.issuer = msg.sender;
        p.kycRequired = kycRequired;
        p.jurisdictionRequired = jurisdictionRequired;
        p.blockSanctioned = blockSanctioned;
        p.maxRiskTier = maxRiskTier;

        p.maxExposure = FHE.fromExternal(inputMaxExposure, inputProof);
        FHE.allowThis(p.maxExposure);
        FHE.allow(p.maxExposure, msg.sender);

        p.issuerExposureCap = FHE.fromExternal(inputIssuerCap, inputProof);
        FHE.allowThis(p.issuerExposureCap);
        FHE.allow(p.issuerExposureCap, msg.sender);

        if (gateContract != address(0)) {
            FHE.allow(p.maxExposure, gateContract);
            FHE.allow(p.issuerExposureCap, gateContract);
        }

        p.active = true;
        p.exists = true;

        emit PolicyCreated(policyId, msg.sender);
    }

    function updatePolicyExposure(
        uint256 policyId,
        externalEuint64 inputMaxExposure,
        externalEuint64 inputIssuerCap,
        bytes calldata inputProof
    ) external {
        Policy storage p = policies[policyId];
        if (p.issuer != msg.sender) revert OnlyIssuer();

        p.maxExposure = FHE.fromExternal(inputMaxExposure, inputProof);
        FHE.allowThis(p.maxExposure);
        FHE.allow(p.maxExposure, msg.sender);

        p.issuerExposureCap = FHE.fromExternal(inputIssuerCap, inputProof);
        FHE.allowThis(p.issuerExposureCap);
        FHE.allow(p.issuerExposureCap, msg.sender);

        emit PolicyExposureUpdated(policyId);
    }

    function togglePolicyActive(uint256 policyId) external {
        Policy storage p = policies[policyId];
        if (p.issuer != msg.sender) revert OnlyIssuer();
        p.active = !p.active;
        emit PolicyActiveToggled(policyId, p.active);
    }

    function getPolicyPublic(
        uint256 policyId
    )
        external
        view
        returns (
            address issuer,
            bool kycRequired,
            bool jurisdictionRequired,
            bool blockSanctioned,
            uint8 maxRiskTier,
            bool active
        )
    {
        Policy storage p = policies[policyId];
        return (p.issuer, p.kycRequired, p.jurisdictionRequired, p.blockSanctioned, p.maxRiskTier, p.active);
    }

    function getIssuer(uint256 policyId) external view returns (address) {
        return policies[policyId].issuer;
    }

    function isPolicyActive(uint256 policyId) external view returns (bool) {
        return policies[policyId].active;
    }

    function policyExists(uint256 policyId) external view returns (bool) {
        return policies[policyId].exists;
    }

    // Internal getters for the gate contract to read encrypted thresholds
    function getMaxExposure(uint256 policyId) external view returns (euint64) {
        return policies[policyId].maxExposure;
    }

    function getIssuerExposureCap(uint256 policyId) external view returns (euint64) {
        return policies[policyId].issuerExposureCap;
    }

    function getMaxRiskTier(uint256 policyId) external view returns (uint8) {
        return policies[policyId].maxRiskTier;
    }

    function getKycRequired(uint256 policyId) external view returns (bool) {
        return policies[policyId].kycRequired;
    }

    function getJurisdictionRequired(uint256 policyId) external view returns (bool) {
        return policies[policyId].jurisdictionRequired;
    }

    function getBlockSanctioned(uint256 policyId) external view returns (bool) {
        return policies[policyId].blockSanctioned;
    }
}
