//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {
    IUniswapV3Pool
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {DSMath} from "../libraries/DSMath.sol";
import {OracleLibrary} from "../libraries/OracleLibrary.sol";
import {Welford} from "../libraries/Welford.sol";
import {IERC20Detailed} from "../interfaces/IERC20Detailed.sol";
import {Math} from "../libraries/Math.sol";
import {PRBMathSD59x18} from "../libraries/PRBMathSD59x18.sol";
import "hardhat/console.sol";

contract VolOracle is DSMath {
    using SafeMath for uint256;

    /**
     * Immutables
     */
    uint32 public immutable period;
    uint256 public immutable windowSize;
    uint256 public immutable annualizationConstant;
    uint256 internal constant commitPhaseDuration = 1800; // 30 minutes from every period

    /// @notice ETH/USDC pool on Uniswap used to derive USDC price of asset
    address public immutable ethUsdcPool;

    /// @notice WETH address to check if it's an ETH pool
    address public immutable WETH;

    /// @notice USDC address used to decide if we should check the ETH/USDC price
    address public immutable USDC;

    /**
     * Storage
     */
    struct Accumulator {
        // Stores the index of next observation
        uint8 currentObservationIndex;
        // Timestamp of the last record
        uint32 lastTimestamp;
        // Smaller size because prices denominated in USDC, max 7.9e27
        int96 mean;
        // Stores the dsquared (variance * count)
        uint120 dsq;
    }

    /// @dev Stores the latest data that helps us compute the standard deviation of the seen dataset.
    mapping(address => Accumulator) public accumulators;

    /// @dev Stores the last oracle TWAP price for a pool
    mapping(address => uint256) public lastPrices;

    /// @dev Stores log-return observations over window
    mapping(address => int256[]) public observations;

    /***
     * Events
     */

    event Commit(
        uint32 commitTimestamp,
        int96 mean,
        uint120 dsq,
        uint256 newValue,
        address committer
    );

    /**
     * @notice Creates an volatility oracle for a pool
     * @param _period is how often the oracle needs to be updated
     * @param _windowInDays is how many days the window should be
     */
    constructor(
        uint32 _period,
        uint256 _windowInDays,
        address _weth,
        address _usdc,
        address _ethUsdcPool
    ) {
        require(_period > 0, "!_period");
        require(_windowInDays > 0, "!_windowInDays");

        period = _period;
        windowSize = _windowInDays.mul(uint256(1 days).div(_period));

        // 31536000 seconds in a year
        // divided by the period duration
        // For e.g. if period = 1 day = 86400 seconds
        // It would be 31536000/86400 = 365 days.
        annualizationConstant = Math.sqrt(uint256(31536000).div(_period));

        WETH = _weth;
        USDC = _usdc;
        ethUsdcPool = _ethUsdcPool;
    }

    /**
     * @notice Initialized pool observation window
     */
    function initPool(address pool) external {
        require(observations[pool].length == 0, "Pool initialized");
        observations[pool] = new int256[](windowSize);
    }

    /**
     * @notice Commits an oracle update. Must be called after pool initialized
     */
    function commit(address pool) public {
        require(observations[pool].length > 0, "!pool initialize");

        (uint32 commitTimestamp, uint32 gapFromPeriod) = secondsFromPeriod();
        require(gapFromPeriod < commitPhaseDuration, "Not commit phase");

        uint256 price = assetPriceInUSDC(pool);
        uint256 _lastPrice = lastPrices[pool];
        uint256 periodReturn = _lastPrice > 0 ? wdiv(price, _lastPrice) : 0;

        require(price > 0, "Price from twap is 0");

        // logReturn is in 10**18
        // we need to scale it down to 10**8
        int256 logReturn =
            periodReturn > 0
                ? PRBMathSD59x18.ln(int256(periodReturn)) / 10**10
                : 0;

        Accumulator storage accum = accumulators[pool];

        require(
            block.timestamp >=
                accum.lastTimestamp + period - commitPhaseDuration,
            "Committed"
        );

        uint256 currentObservationIndex = accum.currentObservationIndex;

        (int256 newMean, int256 newDSQ) =
            Welford.update(
                observationCount(pool, true),
                observations[pool][currentObservationIndex],
                logReturn,
                accum.mean,
                accum.dsq
            );

        require(newMean < type(int96).max, ">I96");
        require(newDSQ < type(uint120).max, ">U120");

        accum.mean = int96(newMean);
        accum.dsq = uint120(newDSQ);
        accum.lastTimestamp = commitTimestamp;
        observations[pool][currentObservationIndex] = logReturn;
        accum.currentObservationIndex = uint8(
            (currentObservationIndex + 1) % windowSize
        );
        lastPrices[pool] = price;

        emit Commit(
            uint32(commitTimestamp),
            int96(newMean),
            uint120(newDSQ),
            price,
            msg.sender
        );
    }

    /**
     * @notice Convenience function to call commit() on multiple pools
     * @param pools is the array of pool addresses. The pools have to be initialized beforehand.
     */
    function multiCommit(address[] calldata pools) external {
        for (uint256 i = 0; i < pools.length; i++) {
            commit(pools[i]);
        }
    }

    /**
     * @notice Returns the standard deviation of the base currency in 10**8 i.e. 1*10**8 = 100%
     * @return standardDeviation is the standard deviation of the asset
     */
    function vol(address pool) public view returns (uint256 standardDeviation) {
        return
            Welford.stdev(
                observationCount(pool, false),
                accumulators[pool].dsq
            );
    }

    /**
     * @notice Returns the annualized standard deviation of the base currency in 10**8 i.e. 1*10**8 = 100%
     * @return annualStdev is the annualized standard deviation of the asset
     */
    function annualizedVol(address pool)
        public
        view
        returns (uint256 annualStdev)
    {
        return
            Welford
                .stdev(observationCount(pool, false), accumulators[pool].dsq)
                .mul(annualizationConstant);
    }

    /**
     * @notice Returns the TWAP for observation period in USDC terms
     * @param pool is the Uniswap V3 pool for which we query a TWAP
     */
    function assetPriceInUSDC(address pool)
        public
        view
        returns (uint256 price)
    {
        IUniswapV3Pool uniPool = IUniswapV3Pool(pool);
        address token0 = uniPool.token0();
        address token1 = uniPool.token1();
        bool isETHPair = token0 == WETH || token1 == WETH;

        if (pool == ethUsdcPool) {
            // Since this is the ETHUSDC pool, we just use token0, which is USDC as the quoteToken
            return _twap(pool, token0, token1, 0);
        } else if (!isETHPair) {
            // Since we don't know whether we should use token0 or token1 as the quoteToken,
            // we just default to using token0
            return _twap(pool, token0, token1, 0);
        }

        uint256 quoteWithToken;
        if (token1 == WETH) {
            quoteWithToken = 1;
        }

        uint256 ethAmount = _twap(pool, token0, token1, quoteWithToken); // Using ETH as the quote token

        // USDC > WETH, so USDC is token0 while WETH is token1
        uint256 ethPriceInUSDC = _twap(ethUsdcPool, USDC, WETH, 0); // Using USDC as the quote token

        // The returned value is 10**18 * 10**6 = 10**24, so we need to get back to 10**18
        // by dividing 10**6
        return ethAmount.mul(ethPriceInUSDC).div(10**6);
    }

    /**
     * @notice Returns the TWAP for the entire Uniswap observation period
     * @param pool is the Uniswap v3 pool address
     * @return price is the TWAP quoted in quote currency
     */
    function twap(address pool) external view returns (uint256 price) {
        IUniswapV3Pool uniPool = IUniswapV3Pool(pool);
        return _twap(pool, uniPool.token0(), uniPool.token1(), 0); // Using ETH as the quote token
    }

    /**
     * @notice Returns the TWAP for the entire Uniswap observation period
     * @param pool is the Uniswap v3 pool
     * @param token0 is the token0 of the v3 pool, saves gas by passing it in
     * @param token1 is the token1 of the v3 pool, saves gas by passing it in
     * @param quoteWithTokenIndex is the either 0 or 1
     * @return price is the TWAP quoted in quote currency
     */
    function _twap(
        address pool,
        address token0,
        address token1,
        uint256 quoteWithTokenIndex
    ) internal view returns (uint256 price) {
        require(
            quoteWithTokenIndex == 0 || quoteWithTokenIndex == 1,
            "quoteWithTokenIndex needs to be 0 or 1"
        );

        (
            int56 oldestTickCumulative,
            int56 newestTickCumulative,
            uint32 duration
        ) = getTickCumulatives(pool);

        require(duration > 0, "!duration");

        int24 timeWeightedAverageTick =
            getTimeWeightedAverageTick(
                oldestTickCumulative,
                newestTickCumulative,
                duration
            );

        // When quoteWithTokenIndex == 0, set token0 as base
        // baseToken is the inverse of that
        address quoteToken = quoteWithTokenIndex == 0 ? token0 : token1;
        address baseToken = quoteWithTokenIndex == 0 ? token1 : token0;

        // Get the price of a unit of asset
        // For ETH, it would be 1 ether (10**18)
        uint256 baseCurrencyDecimals = _lookupDecimals(baseToken);
        uint256 baseTokenAmount = 1 * 10**baseCurrencyDecimals;

        return
            OracleLibrary.getQuoteAtTick(
                timeWeightedAverageTick,
                uint128(baseTokenAmount),
                baseToken,
                quoteToken
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

    /**
     * @notice Returns the closest period from the current block.timestamp
     * @return closestPeriod is the closest period timestamp
     * @return gapFromPeriod is the gap between now and the closest period: abs(periodTimestamp - block.timestamp)
     */
    function secondsFromPeriod()
        internal
        view
        returns (uint32 closestPeriod, uint32 gapFromPeriod)
    {
        uint32 timestamp = uint32(block.timestamp);
        uint32 rem = timestamp % period;
        if (rem < period / 2) {
            return (timestamp - rem, rem);
        }
        return (timestamp + period - rem, period - rem);
    }

    /**
     * @notice Returns the current number of observations [0, windowSize]
     * @param pool is the address of the pool we want to count observations for
     * @param isInc is whether we want to add 1 to the number of
     * observations for mean purposes
     * @return obvCount is the observation count
     */
    function observationCount(address pool, bool isInc)
        internal
        view
        returns (uint256 obvCount)
    {
        uint256 size = windowSize; // cache for gas
        obvCount = observations[pool][size - 1] != 0
            ? size
            : accumulators[pool].currentObservationIndex + (isInc ? 1 : 0);
    }

    /**
     * @notice Convenience function to avoid .decimal lookups, but falls back if not in
     * lookup table. For non-mainnet it will just fallback on looking up via decimals()
     * @param asset for the decimals to lookup for
     * @return the number of decimals
     */
    function _lookupDecimals(address asset) internal view returns (uint256) {
        // WETH
        if (asset == 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2) {
            return 18;
            // WBTC
        } else if (asset == 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599) {
            return 8;
            // USDC
        } else if (asset == 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48) {
            return 6;
        }
        // Fallback to actually performing a storage read
        return IERC20Detailed(asset).decimals();
    }
}
