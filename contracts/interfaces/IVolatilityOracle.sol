//SPDX-License-Identifier: GPL-3.0
pragma solidity >0.6.0 <0.8.7;

interface IVolatilityOracle {
    function commit(address pool) external;

    function getPrice(address pool) external view returns (uint256);

    function vol(address pool)
        external
        view
        returns (uint256 standardDeviation);

    function annualizedVol(address pool)
        external
        view
        returns (uint256 annualStdev);
}
