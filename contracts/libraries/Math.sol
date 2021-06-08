//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

library Math {
    // solhint-disable-next-line
    // Credit to Ryan Hendricks, https://github.com/RyanHendricks/Black-Scholes-Solidity/blob/master/contracts/BlackScholesEstimate.sol
    /**
     * @dev stddev calculates the standard deviation for an array of integers
     * @dev precision is the same as sqrt above meaning for higher precision
     * @dev the decimal place must be moved prior to passing the params
     * @param numbers uint[] array of numbers to be used in calculation
     */
    function stddev(uint256[] memory numbers)
        internal
        pure
        returns (uint256 sd)
    {
        uint256 sum = 0;
        for (uint256 i = 0; i < numbers.length; i++) {
            sum += numbers[i];
        }
        uint256 mean = sum / numbers.length; // Integral value; float not supported in Solidity
        sum = 0;
        uint256 i;
        for (i = 0; i < numbers.length; i++) {
            sum += (numbers[i] - mean)**2;
        }
        sd = sqrt(sum / (numbers.length - 1)); //Integral value; float not supported in Solidity
        return sd;
    }

    // solhint-disable-next-line
    // Credit to Paul Razvan Berg https://github.com/hifi-finance/prb-math/blob/main/contracts/PRBMath.sol
    function sqrt(uint256 x) internal pure returns (uint256 result) {
        if (x == 0) {
            return 0;
        }

        // Set the initial guess to the closest power of two that is higher than x.
        uint256 xAux = uint256(x);
        result = 1;
        if (xAux >= 0x100000000000000000000000000000000) {
            xAux >>= 128;
            result <<= 64;
        }
        if (xAux >= 0x10000000000000000) {
            xAux >>= 64;
            result <<= 32;
        }
        if (xAux >= 0x100000000) {
            xAux >>= 32;
            result <<= 16;
        }
        if (xAux >= 0x10000) {
            xAux >>= 16;
            result <<= 8;
        }
        if (xAux >= 0x100) {
            xAux >>= 8;
            result <<= 4;
        }
        if (xAux >= 0x10) {
            xAux >>= 4;
            result <<= 2;
        }
        if (xAux >= 0x8) {
            result <<= 1;
        }

        // The operations can never overflow because the result is max 2^127 when it enters this block.
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1; // Seven iterations should be enough
        uint256 roundedDownResult = x / result;
        return result >= roundedDownResult ? roundedDownResult : result;
    }
}
