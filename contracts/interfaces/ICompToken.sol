//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.3;

interface ICompToken {
    function supplyRatePerBlock() external view returns (uint256 supplyRate);
}
