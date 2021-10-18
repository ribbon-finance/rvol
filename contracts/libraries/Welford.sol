// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {SignedSafeMath} from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import {Math} from "./Math.sol";
import "hardhat/console.sol";

// REFERENCE
// https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm
library Welford {
    using SignedSafeMath for int256;

    /**
     * @notice Performs an update of the tuple (count, mean, m2) using the new value
     * @param curCount is the current value for count
     * @param curMean is the current value for mean
     * @param curM2 is the current value for M2
     * @param oldM2Diff is the difference in M2 from adding oldValue to data set
     * @param oldValue is the old value to be removed from the dataset
     * @param newValue is the new value to be added into the dataset
     */
    function update(
        uint256 curCount,
        int256 curMean,
        uint256 curM2,
        uint256 oldM2Diff,
        int256 oldValue,
        int256 newValue
    )
        internal
        view
        returns (
            int256 mean,
            uint256 m2,
            uint256 m2Diff
        )
    {
        // If the value from the beginning of the week
        // is non-zero then subtract it from mean
        int256 _mean =
            curCount > 1 && oldValue > 0
                ? curMean.mul(int256(curCount)).sub(oldValue).div(
                    int256(curCount) - 1
                )
                : curMean;
        int256 delta = newValue.sub(int256(_mean));
        _mean = int256(_mean).add(delta.div(int256(curCount + 1)));
        int256 delta2 = newValue.sub(_mean);
        int256 _m2Diff = delta.mul(delta2);
        int256 _m2 = int256(curM2).add(_m2Diff).sub(int256(oldM2Diff));
        console.log(
            "adding %s and subtracting %s",
            uint256(_m2Diff),
            oldM2Diff
        );

        require(_m2 >= 0, "m2<0");

        mean = _mean;
        m2 = uint256(_m2);
        m2Diff = uint256(_m2Diff);
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
