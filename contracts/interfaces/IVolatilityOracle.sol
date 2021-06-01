//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.3;

interface IVolatilityOracle {
    function getHourlyTWAP(uint32 numHours)
        external
        view
        returns (uint256[] memory);
}
