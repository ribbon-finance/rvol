// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {SignedSafeMath} from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import {Welford} from "../libraries/Welford.sol";

contract TestWelford {
    using SignedSafeMath for int256;
    int256 public mean;
    int256 public dsq;
    uint256 public windowSize;
    // Stores log-return observations over window
    int256[] public observations;
    // Stores the index of next observation
    uint256 public currObv;

    function update(int256 newValue, uint256 newWindowSize) external {
        (int256 newMean, int256 newDSQ) =
            Welford.update(
                observations.length < newWindowSize
                    ? currObv + 1
                    : newWindowSize,
                observations.length < newWindowSize ? 0 : observations[currObv],
                newValue,
                mean,
                dsq
            );

        if (observations.length < newWindowSize) {
            observations.push(newValue);
        } else {
            observations[currObv] = newValue;
        }
        currObv = uint8((currObv + 1) % newWindowSize);

        windowSize = newWindowSize;
        mean = newMean;
        dsq = newDSQ;
    }

    function stdev() external view returns (uint256) {
        return
            Welford.stdev(
                observations.length < windowSize ? currObv : windowSize,
                dsq
            );
    }
}
