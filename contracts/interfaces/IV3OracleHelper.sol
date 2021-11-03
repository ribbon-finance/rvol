// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.7.3;

interface IV3OracleHelper {
    function twapETHPoolForUSDCPrice(address pool, uint256 twapDuration) external returns (uint256);

    function twap(address pool, uint256 twapDuration) external returns (uint256);
}
