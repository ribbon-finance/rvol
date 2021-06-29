//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.3;

interface IVolatilityOracle {
    function commit(address pool) external;

    function twap(address pool) external returns (uint256 price);

    function vol(address pool)
        external
        view
        returns (uint256 standardDeviation);

    function annualizedVol(address pool)
        external
        view
        returns (uint256 annualStdev);
}
