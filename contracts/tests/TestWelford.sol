// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {Welford} from "../libraries/Welford.sol";

contract TestWelford {
    int256 public mean;
    uint256 public m2;
    uint256 public windowSize;
    // Stores log-return observations over window
    int256[] public observations;
    // Stores m2 observations over window
    uint256[] public m2observations;
    // Stores the index of next observation
    uint256 public currObv;

    function update(int256 newValue, uint256 newWindowSize) external {
        (int256 newMean, uint256 newM2, uint256 m2Diff) =
            Welford.update(
                observations.length < newWindowSize ? currObv : newWindowSize,
                mean,
                m2,
                observations.length < newWindowSize
                    ? 0
                    : m2observations[currObv],
                observations.length < newWindowSize ? 0 : observations[currObv],
                newValue
            );

        if (observations.length < newWindowSize) {
            observations.push(newValue);
            m2observations.push(m2Diff);
        } else {
            observations[currObv] = newValue;
            m2observations[currObv] = m2Diff;
        }
        currObv = uint8((currObv + 1) % newWindowSize);

        windowSize = newWindowSize;
        mean = newMean;
        m2 = newM2;
    }

    function stdev() external view returns (uint256) {
        return
            Welford.stdev(
                observations.length < windowSize ? currObv : windowSize,
                m2
            );
    }
}
