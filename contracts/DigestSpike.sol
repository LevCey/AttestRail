// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "encrypted-types/EncryptedTypes.sol";

/// @title Spike S2 — Handle Digest Verification Fixture
/// @notice Confirms on-chain/off-chain keccak256 packing match for submitProfile
contract DigestSpike {
    function computeDigest(
        externalEbool kyc,
        externalEbool jurisdiction,
        externalEbool sanctions,
        externalEuint8 riskTier,
        externalEuint64 currentExposure
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    externalEbool.unwrap(kyc),
                    externalEbool.unwrap(jurisdiction),
                    externalEbool.unwrap(sanctions),
                    externalEuint8.unwrap(riskTier),
                    externalEuint64.unwrap(currentExposure)
                )
            );
    }
}
