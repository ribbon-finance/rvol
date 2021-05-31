// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {Math} from "./Math.sol";

// REFERENCE
// https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm
library Welford {
    /**
     * @notice Performs an update of the tuple (count, mean, m2) using the new value
     * @param curCount is the current value for count
     * @param curMean is the current value for mean
     * @param curM2 is the current value for M2
     * @param newValue is the new value to be added into the dataset
     */
    function update(
        uint256 curCount,
        uint256 curMean,
        uint256 curM2,
        uint256 newValue
    )
        internal
        pure
        returns (
            uint256 count,
            uint256 mean,
            uint256 m2
        )
    {
        count = curCount + 1;
        uint256 delta = newValue - curMean;
        mean = curMean + delta / count;
        uint256 delta2 = newValue - mean;
        m2 = curM2 + delta * delta2;
    }

    /**
     * @notice Calculate the variance using the existing tuple (count, mean, m2)
     * @param count is the length of the dataset
     * @param m2 is the delta value
     */
    function getVariance(uint256 count, uint256 m2)
        internal
        pure
        returns (uint256 variance)
    {
        variance = m2 / count;
    }

    /**
     * @notice Calculate the standard deviation using the existing tuple (count, mean, m2)
     * @param count is the length of the dataset
     * @param m2 is the delta value
     */
    function getStdev(uint256 count, uint256 m2)
        internal
        pure
        returns (uint256)
    {
        return Math.sqrt(getVariance(count, m2));
    }
}
