// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {Welford} from "../libraries/Welford.sol";

contract TestWelford {
    uint256 public count;
    int256 public mean;
    uint256 public m2;

    function update(int256 newValue, uint256 windowSize) external {
        (int256 newMean, uint256 newM2) =
            Welford.update(windowSize, mean, m2, newValue);

        count = windowSize;
        mean = newMean;
        m2 = newM2;
    }

    function stdev() external view returns (uint256) {
        return Welford.stdev(count, m2);
    }
}
