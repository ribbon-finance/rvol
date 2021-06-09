//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.3;

interface IVolatilityOracle {
    function commit() external;

    function twap() external returns (uint256 price);

    function vol() external view returns (uint256 standardDeviation);

    function annualizedVol() external view returns (uint256 annualStdev);

    function baseCurrency() external view returns (address currency);
}
