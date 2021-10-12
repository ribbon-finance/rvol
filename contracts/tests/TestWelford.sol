// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {Welford} from "../libraries/Welford.sol";

contract TestWelford {
    uint256 public count;
    int256 public mean;
    uint256 public m2;

    function update(
        uint256 oldM2Diff,
        int256 newValue,
        int256 oldValue,
        uint256 windowSize
    ) external {
        (int256 newMean, uint256 newM2, ) =
            Welford.update(windowSize, mean, m2, oldM2Diff, oldValue, newValue);

        count = windowSize;
        mean = newMean;
        m2 = newM2;
    }

    function stdev() external view returns (uint256) {
        return Welford.stdev(count, m2);
    }
}
