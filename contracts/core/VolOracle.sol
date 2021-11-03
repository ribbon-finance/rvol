//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {DSMath} from "../libraries/DSMath.sol";
import {OracleLibrary} from "../libraries/OracleLibrary.sol";
import {Welford} from "../libraries/Welford.sol";
import {IERC20Detailed} from "../interfaces/IERC20Detailed.sol";
import {Math} from "../libraries/Math.sol";
import {PRBMathSD59x18} from "../libraries/PRBMathSD59x18.sol";
import {IV3OracleHelper} from "../interfaces/IV3OracleHelper.sol";
import "hardhat/console.sol";

contract VolOracle is DSMath {
    using SafeMath for uint256;

    /**
     * Immutables
     */
    uint32 public immutable period;
    uint256 public immutable windowSize;
    uint256 public immutable annualizationConstant;
    uint256 public immutable twapDuration;
    uint256 internal constant commitPhaseDuration = 1800; // 30 minutes from every period

    /// @notice Helper contract that provides simplified API around querying TWAPs
    IV3OracleHelper public immutable v3Oracle;

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
        uint256 _twapDuration,
        address _v3Oracle
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

        twapDuration = _twapDuration;
        v3Oracle = IV3OracleHelper(_v3Oracle);
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

        uint256 price = v3Oracle.twapETHPoolForUSDCPrice(pool, twapDuration);
        uint256 _lastPrice = lastPrices[pool];
        uint256 periodReturn = _lastPrice > 0 ? wdiv(price, _lastPrice) : 0;

        require(price > 0, "Price from twap is 0");

        // logReturn is in 10**18
        // we need to scale it down to 10**8
        int256 logReturn = periodReturn > 0
            ? PRBMathSD59x18.ln(int256(periodReturn)) / 10**10
            : 0;

        Accumulator storage accum = accumulators[pool];

        require(
            block.timestamp >=
                accum.lastTimestamp + period - commitPhaseDuration,
            "Committed"
        );

        uint256 currentObservationIndex = accum.currentObservationIndex;

        (int256 newMean, int256 newDSQ) = Welford.update(
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
}
