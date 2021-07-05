// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {SignedSafeMath} from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import {Math} from "./Math.sol";

// REFERENCE
// https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm
library Welford {
    using SignedSafeMath for int256;

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
        int256 newValue
    )
        internal
        pure
        returns (
            uint256 count,
            uint256 mean,
            uint256 m2
        )
    {
        int256 _count = int256(curCount + 1);
        int256 delta = newValue.sub(int256(curMean));
        int256 _mean = int256(curMean).add(delta.div(_count));
        int256 delta2 = newValue.sub(_mean);
        int256 _m2 = int256(curM2).add(delta.mul(delta2));

        require(_count > 0, "count<=0");
        require(_mean >= 0, "mean<0");
        require(_m2 >= 0, "m2<0");

        count = uint256(_count);
        mean = uint256(_mean);
        m2 = uint256(_m2);
    }

    /**
     * @notice Calculate the variance using the existing tuple (count, mean, m2)
     * @param count is the length of the dataset
     * @param m2 is the sum of square errors
     */
    function variance(uint256 count, uint256 m2)
        internal
        pure
        returns (uint256)
    {
        require(count > 0, "!count");
        return m2 / count;
    }

    /**
     * @notice Calculate the standard deviation using the existing tuple (count, mean, m2)
     * @param count is the length of the dataset
     * @param m2 is the sum of square errors
     */
    function stdev(uint256 count, uint256 m2) internal pure returns (uint256) {
        return Math.sqrt(variance(count, m2));
    }
}
