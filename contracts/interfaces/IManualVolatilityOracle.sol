//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.3;

interface IManualVolatilityOracle {
    function vol(address pool)
        external
        view
        returns (uint256 standardDeviation);

    function annualizedVol(address pool)
        external
        view
        returns (uint256 annualStdev);

    function setAnnualizedVol(address pool, uint256 annualizedVol) external;
}
