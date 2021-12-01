//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {
    IUniswapV3Pool
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {VolOracle} from "./VolOracle.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {OracleLibrary} from "../libraries/OracleLibrary.sol";
import {IERC20Detailed} from "../interfaces/IERC20Detailed.sol";

contract V3TwapVolOracle is VolOracle {
    using SafeMath for uint256;

    constructor(uint32 _period, uint256 _windowInDays)
        VolOracle(_period, _windowInDays)
    {}

    /**
     * @notice Returns the TWAP for the entire Uniswap observation period
     * @return price is the TWAP quoted in quote currency
     */
    function getPrice(address pool)
        public
        view
        override
        returns (uint256 price)
    {
        (
            int56 oldestTickCumulative,
            int56 newestTickCumulative,
            uint32 duration
        ) = getTickCumulatives(pool);

        IUniswapV3Pool uniPool = IUniswapV3Pool(pool);
        address token0 = uniPool.token0();
        address token1 = uniPool.token1();

        require(duration > 0, "!duration");

        int24 timeWeightedAverageTick =
            getTimeWeightedAverageTick(
                oldestTickCumulative,
                newestTickCumulative,
                duration
            );

        // Get the price of a unit of asset
        // For ETH, it would be 1 ether (10**18)
        uint256 baseCurrencyDecimals = IERC20Detailed(token0).decimals();
        uint128 quoteAmount = uint128(1 * 10**baseCurrencyDecimals);

        return
            OracleLibrary.getQuoteAtTick(
                timeWeightedAverageTick,
                quoteAmount,
                token0,
                token1
            );
    }

    /**
     * @notice Gets the time weighted average tick
     * @return timeWeightedAverageTick is the tick which was resolved to be the time-weighted average
     */
    function getTimeWeightedAverageTick(
        int56 olderTickCumulative,
        int56 newerTickCumulative,
        uint32 duration
    ) private pure returns (int24 timeWeightedAverageTick) {
        int56 tickCumulativesDelta = newerTickCumulative - olderTickCumulative;
        int24 _timeWeightedAverageTick = int24(tickCumulativesDelta / duration);

        // Always round to negative infinity
        if (tickCumulativesDelta < 0 && (tickCumulativesDelta % duration != 0))
            _timeWeightedAverageTick--;

        return _timeWeightedAverageTick;
    }

    /**
     * @notice Gets the tick cumulatives which is the tick * seconds
     * @return oldestTickCumulative is the tick cumulative at last index of the observations array
     * @return newestTickCumulative is the tick cumulative at the first index of the observations array
     * @return duration is the TWAP duration determined by the difference between newest-oldest
     */
    function getTickCumulatives(address pool)
        private
        view
        returns (
            int56 oldestTickCumulative,
            int56 newestTickCumulative,
            uint32 duration
        )
    {
        IUniswapV3Pool uniPool = IUniswapV3Pool(pool);

        (, , uint16 newestIndex, uint16 observationCardinality, , , ) =
            uniPool.slot0();

        // Get the latest observation
        (uint32 newestTimestamp, int56 _newestTickCumulative, , ) =
            uniPool.observations(newestIndex);

        // Get the oldest observation
        uint256 oldestIndex = (newestIndex + 1) % observationCardinality;
        (uint32 oldestTimestamp, int56 _oldestTickCumulative, , ) =
            uniPool.observations(oldestIndex);

        uint32 _duration = newestTimestamp - oldestTimestamp;

        return (_oldestTickCumulative, _newestTickCumulative, _duration);
    }
}
