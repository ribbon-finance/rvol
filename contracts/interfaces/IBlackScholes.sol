//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.3;

interface IBlackScholes {
    function quoteAll(
        uint256 t,
        uint256 v,
        uint256 sp,
        uint256 st
    ) external view returns (uint256 call, uint256 put);
}
