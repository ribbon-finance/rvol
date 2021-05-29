//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {OracleLibrary} from "../libraries/OracleLibrary.sol";
import {IERC20Detailed} from "../interfaces/IERC20Detailed.sol";
import "hardhat/console.sol";

contract VolatilityOracle {
    /**
     * Immutables
     */
    address public immutable pool;
    address public immutable baseCurrency;
    address public immutable quoteCurrency;
    uint8 private immutable baseCurrencyDecimals;
    uint32 private constant period = 3600; // 1 hour

    /**
     * Storage
     */
    uint256 public meanAccumulator;
    uint256 public varianceAccumulator;
    uint256 private recordBitmap;

    constructor(
        address _pool,
        address _baseCurrency,
        address _quoteCurrency
    ) {
        pool = _pool;
        baseCurrency = _baseCurrency;
        quoteCurrency = _quoteCurrency;
        baseCurrencyDecimals = IERC20Detailed(_baseCurrency).decimals();
    }

    function commit(uint32 numHours) {
        uint256[] memory prices = getHourlyTWAP(numHours);
    }

    function getHourlyTWAP(uint32 numHours)
        public
        view
        returns (uint256[] memory)
    {
        uint32 adjust = uint32(block.timestamp - topOfHour());

        // Space out the seconds by the hour
        uint32[] memory secondAgos = new uint32[](numHours + 1);
        for (uint8 i = 0; i < numHours + 1; i++) {
            secondAgos[i] = period * uint32(numHours - i) + adjust;
        }

        int24[] memory twapTick = new int24[](numHours);

        (int56[] memory tickCumulatives, ) =
            IUniswapV3Pool(pool).observe(secondAgos);

        for (uint8 i = 1; i < numHours + 1; i++) {
            int56 tickCumulativesDelta =
                tickCumulatives[i] - tickCumulatives[i - 1];

            int24 timeWeightedAverageTick =
                int24(tickCumulativesDelta / period);

            // Always round to negative infinity
            if (
                tickCumulativesDelta < 0 && (tickCumulativesDelta % period != 0)
            ) timeWeightedAverageTick--;

            twapTick[i - 1] = timeWeightedAverageTick;
        }

        uint256[] memory prices = new uint256[](numHours);
        uint128 quoteAmount = uint128(1 * 10**baseCurrencyDecimals);

        for (uint8 i = 0; i < numHours; i++) {
            uint256 price =
                OracleLibrary.getQuoteAtTick(
                    twapTick[i],
                    quoteAmount,
                    baseCurrency,
                    quoteCurrency
                );
            prices[i] = price;
        }
        return prices;
    }

    function topOfHour() internal view returns (uint256) {
        return block.timestamp - (block.timestamp % 3600);
    }
}
