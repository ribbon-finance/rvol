// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {Welford} from "../libraries/Welford.sol";

contract TestWelford {
    uint256 public count;
    uint256 public mean;
    uint256 public m2;

    function update(uint256 newValue) external {
        (uint256 newCount, uint256 newMean, uint256 newM2) =
            Welford.update(count, mean, m2, newValue);

        count = newCount;
        mean = newMean;
        m2 = newM2;
    }

    function stdev() external view returns (uint256) {
        return Welford.getStdev(count, m2);
    }
}
