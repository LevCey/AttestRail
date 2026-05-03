// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {AttestRailPolicy} from "./AttestRailPolicy.sol";
import {AttestRailRegistry} from "./AttestRailRegistry.sol";

/// @title PrivateEligibilityGate — per-user + aggregate FHE eligibility check
contract PrivateEligibilityGate is ZamaEthereumConfig {
    enum Status {
        PendingDecryption,
        Decryptable
    }

    struct Check {
        address user;
        uint256 policyId;
        address to;
        uint64 amount;
        ebool encryptedEligible;
        Status status;
        bool consumed;
        bool exists;
    }

    struct IssuerAggregate {
        euint64 totalActiveExposure;
        bool initialized;
    }

    AttestRailPolicy public immutable policyContract;
    AttestRailRegistry public immutable registry;
    uint256 public nextCheckSalt;
    address public tokenContract;

    mapping(bytes32 => Check) public checks;
    mapping(uint256 => IssuerAggregate) internal issuerAggregates;

    error ProfileNotFound();
    error PolicyInactive();
    error AttestationExpired();
    error CheckNotFound();
    error WrongStatus();
    error CheckConsumed();
    error CheckParamMismatch();

    event EligibilityCheckCreated(bytes32 indexed checkId, address indexed user, uint256 indexed policyId);
    event EligibilityDecryptable(bytes32 indexed checkId);

    constructor(AttestRailPolicy _policy, AttestRailRegistry _registry) {
        policyContract = _policy;
        registry = _registry;
    }

    function setTokenContract(address _token) external {
        tokenContract = _token;
    }

    function createEligibilityCheck(
        uint256 policyId,
        address to,
        uint64 transferAmount
    ) external returns (bytes32 checkId) {
        // Validate preconditions
        if (!registry.profileExists(msg.sender)) revert ProfileNotFound();
        if (!policyContract.isPolicyActive(policyId)) revert PolicyInactive();
        if (block.timestamp > registry.getAttestationExpiry(msg.sender)) revert AttestationExpired();

        // Read profile
        (
            ebool kycVerified,
            ebool jurisdictionAllowed,
            ebool sanctionsFlag,
            euint8 riskTier,
            euint64 currentExposure,
            ,
            ,

        ) = registry.getProfile(msg.sender);

        // Per-user eligibility computation
        ebool eligible = kycVerified;

        if (policyContract.getJurisdictionRequired(policyId)) {
            eligible = FHE.and(eligible, jurisdictionAllowed);
        }

        if (policyContract.getBlockSanctioned(policyId)) {
            eligible = FHE.and(eligible, FHE.not(sanctionsFlag));
        }

        // riskTier <= maxRiskTier
        euint8 maxRiskEnc = FHE.asEuint8(policyContract.getMaxRiskTier(policyId));
        eligible = FHE.and(eligible, FHE.le(riskTier, maxRiskEnc));

        // currentExposure + transferAmount <= maxExposure
        euint64 transferAmountEnc = FHE.asEuint64(transferAmount);
        euint64 exposureAfter = FHE.add(currentExposure, transferAmountEnc);
        euint64 maxExposure = policyContract.getMaxExposure(policyId);
        eligible = FHE.and(eligible, FHE.le(exposureAfter, maxExposure));

        // Aggregate cap check
        _initAggregateIfNeeded(policyId);
        IssuerAggregate storage agg = issuerAggregates[policyId];

        euint64 newAggregate = FHE.add(agg.totalActiveExposure, transferAmountEnc);
        euint64 issuerCap = policyContract.getIssuerExposureCap(policyId);
        ebool aggregateAllowed = FHE.le(newAggregate, issuerCap);
        eligible = FHE.and(eligible, aggregateAllowed);

        // Update aggregate via FHE.select
        agg.totalActiveExposure = FHE.select(eligible, newAggregate, agg.totalActiveExposure);
        FHE.allowThis(agg.totalActiveExposure);
        address issuer = policyContract.getIssuer(policyId);
        FHE.allow(agg.totalActiveExposure, issuer);

        // Store check
        FHE.allowThis(eligible);
        if (tokenContract != address(0)) {
            FHE.allow(eligible, tokenContract);
        }
        checkId = keccak256(abi.encodePacked(msg.sender, policyId, to, transferAmount, nextCheckSalt++));
        checks[checkId] = Check({
            user: msg.sender,
            policyId: policyId,
            to: to,
            amount: transferAmount,
            encryptedEligible: eligible,
            status: Status.PendingDecryption,
            consumed: false,
            exists: true
        });

        emit EligibilityCheckCreated(checkId, msg.sender, policyId);
    }

    function requestPublicDecryption(bytes32 checkId) external {
        Check storage c = checks[checkId];
        if (!c.exists) revert CheckNotFound();
        if (c.status != Status.PendingDecryption) revert WrongStatus();

        FHE.makePubliclyDecryptable(c.encryptedEligible);
        c.status = Status.Decryptable;

        emit EligibilityDecryptable(checkId);
    }

    // --- Views for MockRWAToken ---

    function getCheck(
        bytes32 checkId
    )
        external
        view
        returns (
            address user,
            uint256 policyId,
            address to,
            uint64 amount,
            ebool encryptedEligible,
            Status status,
            bool consumed,
            bool exists
        )
    {
        Check storage c = checks[checkId];
        return (c.user, c.policyId, c.to, c.amount, c.encryptedEligible, c.status, c.consumed, c.exists);
    }

    function markConsumed(bytes32 checkId) external {
        checks[checkId].consumed = true;
    }

    function getEncryptedEligible(bytes32 checkId) external view returns (ebool) {
        return checks[checkId].encryptedEligible;
    }

    // --- Internal ---

    function _initAggregateIfNeeded(uint256 policyId) internal {
        IssuerAggregate storage agg = issuerAggregates[policyId];
        if (!agg.initialized) {
            agg.totalActiveExposure = FHE.asEuint64(0);
            FHE.allowThis(agg.totalActiveExposure);
            address issuer = policyContract.getIssuer(policyId);
            FHE.allow(agg.totalActiveExposure, issuer);
            agg.initialized = true;
        }
    }
}
