//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {OracleLibrary} from "../libraries/OracleLibrary.sol";
import {Welford} from "../libraries/Welford.sol";
import {IERC20Detailed} from "../interfaces/IERC20Detailed.sol";
import "hardhat/console.sol";

contract VolOracle {
    /**
     * Immutables
     */
    address public immutable pool;
    address public immutable baseCurrency;
    address public immutable quoteCurrency;
    uint32 public immutable period;
    uint8 private immutable baseCurrencyDecimals;

    /**
     * Storage
     */
    struct Accumulator {
        // 2^16-1 = 65535. Max ~15 years of data
        uint16 count;
        // Timestamp of the last record
        uint32 lastTimestamp;
        // Smaller size because prices denominated in USDC, max 7.9e27
        uint96 mean;
        // Stores the result of multiplicating prices
        uint112 m2;
    }

    Accumulator public accumulator;

    constructor(
        address _pool,
        address _baseCurrency,
        address _quoteCurrency,
        uint32 _period
    ) {
        pool = _pool;
        baseCurrency = _baseCurrency;
        quoteCurrency = _quoteCurrency;
        baseCurrencyDecimals = IERC20Detailed(_baseCurrency).decimals();
        period = _period;
    }

    function commit() external {
        (, , uint256 price) = twap();
        Accumulator storage accum = accumulator;

        require(block.timestamp >= accum.lastTimestamp + period, "Early");

        (uint256 newCount, uint256 newMean, uint256 newM2) =
            Welford.update(accum.count, accum.mean, accum.m2, price);

        accum.count = uint16(newCount);
        accum.mean = uint96(newMean);
        accum.m2 = uint112(newM2);
        accum.lastTimestamp = uint32(topOfPeriod());
    }

    function stdev() external view returns (uint256) {
        return Welford.getStdev(accumulator.count, accumulator.m2);
    }

    function twap()
        public
        view
        returns (
            uint32 start,
            uint32 end,
            uint256 price
        )
    {
        end = uint32(topOfPeriod());
        start = end - period;

        // Space out the seconds by the hour
        uint32[] memory secondAgos = new uint32[](2);
        secondAgos[0] = uint32(block.timestamp) - end + period;
        secondAgos[1] = uint32(block.timestamp) - end;

        (int56[] memory tickCumulatives, ) =
            IUniswapV3Pool(pool).observe(secondAgos);

        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

        int24 timeWeightedAverageTick = int24(tickCumulativesDelta / period);

        // Always round to negative infinity
        if (tickCumulativesDelta < 0 && (tickCumulativesDelta % period != 0))
            timeWeightedAverageTick--;

        uint128 quoteAmount = uint128(1 * 10**baseCurrencyDecimals);

        price = OracleLibrary.getQuoteAtTick(
            timeWeightedAverageTick,
            quoteAmount,
            baseCurrency,
            quoteCurrency
        );
    }

    function topOfPeriod() internal view returns (uint256) {
        return block.timestamp - (block.timestamp % period);
    }
}
