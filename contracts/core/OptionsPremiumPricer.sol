//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {IVolatilityOracle} from "../interfaces/IVolatilityOracle.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {DSMath} from "../libraries/DSMath.sol";
import {IERC20Detailed} from "../interfaces/IERC20Detailed.sol";
import {Math} from "../libraries/Math.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import "hardhat/console.sol";

contract OptionsPremiumPricer is DSMath {
    using SafeMath for uint256;

    /**
     * Immutables
     */
    IVolatilityOracle public immutable volatilityOracle;
    IPriceOracle public immutable priceOracle;
    IPriceOracle public immutable stablesOracle;

    // For reference - IKEEP3rVolatility: 0xCCdfCB72753CfD55C5afF5d98eA5f9C43be9659d

    constructor(
        address _volatilityOracle,
        address _priceOracle,
        address _stablesOracle
    ) {
        require(_volatilityOracle != address(0), "!_volatilityOracle");
        require(_priceOracle != address(0), "!_priceOracle");
        require(_stablesOracle != address(0), "!_stablesOracle");

        volatilityOracle = IVolatilityOracle(_volatilityOracle);
        priceOracle = IPriceOracle(_priceOracle);
        stablesOracle = IPriceOracle(_stablesOracle);
    }

    /**
     * @notice Calculates the premium of the provided option using Black-Scholes
     * References for Black-Scholes:
       https://www.macroption.com/black-scholes-formula/
       https://www.investopedia.com/terms/b/blackscholes.asp
       https://www.erieri.com/blackscholes
       https://goodcalculators.com/black-scholes-calculator/
       https://www.calkoo.com/en/black-scholes-option-pricing-model
     * @param st is the strike price of the option
     * @param expiryTimestamp is the unix timestamp of expiry
     * @param isPut is whether the option is a put option
     * @return premium for 100 contracts with 18 decimals i.e.
     * 500*10**18 = 500 USDC for 100 contracts for puts,
     * 5*10**18 = 5 of underlying asset (ETH, WBTC, etc.) for 100 contracts for calls,
     */
    function getPremium(
        uint256 st,
        uint256 expiryTimestamp,
        bool isPut
    ) external view returns (uint256 premium) {
        require(
            expiryTimestamp > block.timestamp,
            "Expiry must be in the future!"
        );

        (uint256 sp, uint256 v, uint256 t) =
            blackScholesParams(expiryTimestamp);

        (uint256 call, uint256 put) = quoteAll(t, v, sp, st);

        // Multiplier to convert oracle latestAnswer to 18 decimals
        uint256 assetOracleMultiplier =
            10 **
                (
                    uint256(18).sub(
                        isPut
                            ? stablesOracle.decimals()
                            : priceOracle.decimals()
                    )
                );

        // Make option premium denominated in the underlying
        // asset for call vaults and USDC for put vaults
        premium = isPut
            ? wdiv(put, stablesOracle.latestAnswer().mul(assetOracleMultiplier))
            : wdiv(call, priceOracle.latestAnswer().mul(assetOracleMultiplier));

        // Convert to 18 decimals
        premium = premium.mul(assetOracleMultiplier);
    }

    /**
     * @notice Calculates the option's delta
     * Formula reference: `d_1` in https://www.investopedia.com/terms/b/blackscholes.asp
     * http://www.optiontradingpedia.com/options_delta.htm
     * https://www.macroption.com/black-scholes-formula/
     * @param st is the strike price of the option
     * @param expiryTimestamp is the unix timestamp of expiry
     * @return delta for given option. 2 decimals (ex: 81 = 0.81 delta) as this is what strike selection
     * module recognizes
     */
    function getOptionDelta(uint256 st, uint256 expiryTimestamp)
        external
        view
        returns (uint256 delta)
    {
        require(
            expiryTimestamp > block.timestamp,
            "Expiry must be in the future!"
        );

        (uint256 sp, uint256 v, uint256 t) =
            blackScholesParams(expiryTimestamp);

        uint256 d1;
        uint256 d2;

        // Divide delta by 10 ** 12 to bring it to 2 decimals for strike selection
        if (sp >= st) {
            (d1, d2) = d(t, v, sp, st);
            delta = Math.ncdf((Math.FIXED_1 * d1) / 1e18).div(10**12);
        } else {
            // If underlying < strike price notice we switch st <-> sp passed into d
            (d1, d2) = d(t, v, st, sp);
            delta = uint256(10)
                .mul(10**13)
                .sub(Math.ncdf((Math.FIXED_1 * d2) / 1e18))
                .div(10**12);
        }
    }

    /**
     * @notice Calculates black scholes for both put and call
     * @param t is the days until expiry
     * @param v is the annualized volatility
     * @param sp is the underlying price
     * @param st is the strike price
     * @return call is the premium of the call option given parameters
     * @return put is the premium of the put option given parameters
     */
    function quoteAll(
        uint256 t,
        uint256 v,
        uint256 sp,
        uint256 st
    ) private view returns (uint256 call, uint256 put) {
        uint256 _c;
        uint256 _p;

        if (sp > st) {
            _c = C(t, v, sp, st);
            _p = max(_c.add(st), sp) == sp ? 0 : _c.add(st).sub(sp);
        } else {
            _p = C(t, v, st, sp);
            _c = max(_p.add(sp), st) == st ? 0 : _p.add(sp).sub(st);
        }

        return (_c, _p);
    }

    /**
     * @notice Calculates black scholes for the ITM option at mint given strike
     * price and underlying given the parameters (if underling >= strike price this is
     * premium of call, and put otherwise)
     * @param t is the days until expiry
     * @param v is the annualized volatility
     * @param sp is the underlying price
     * @param st is the strike price
     * @return premium is the premium of option
     */
    function C(
        uint256 t,
        uint256 v,
        uint256 sp,
        uint256 st
    ) private view returns (uint256 premium) {
        if (sp == st) {
            return
                (((((Math.LNX * sp) / 1e10) * v) / 1e18) *
                    Math.sqrt2((1e18 * t) / 365)) / 1e9;
        }

        (uint256 d1, uint256 d2) = d(t, v, sp, st);

        uint256 cdfD1 = Math.ncdf((Math.FIXED_1 * d1) / 1e18);
        uint256 cdfD2 = Math.cdf((int256(Math.FIXED_1) * int256(d2)) / 1e18);

        premium = (sp * cdfD1) / 1e14 - (st * cdfD2) / 1e14;
    }

    /**
     * @notice Calculates d1 and d2 used in black scholes calculation
     * as parameters to black scholes calculations
     * @param t is the days until expiry
     * @param v is the annualized volatility
     * @param sp is the underlying price
     * @param st is the strike price
     * @return d1 and d2
     */
    function d(
        uint256 t,
        uint256 v,
        uint256 sp,
        uint256 st
    ) private view returns (uint256 d1, uint256 d2) {
        uint256 sigma = ((v**2) / 2);
        uint256 sigmaB = 1e36;

        uint256 sig = (((1e18 * sigma) / sigmaB) * t) / 365;

        uint256 sSQRT = (v * Math.sqrt2((1e18 * t) / 365)) / 1e9;

        d1 = (1e18 * Math.ln((Math.FIXED_1 * sp) / st)) / Math.FIXED_1;
        d1 = ((d1 + sig) * 1e18) / sSQRT;
        d2 = d1 - sSQRT;
    }

    /**
     * @notice Calculates the current underlying price, annualized volatility, and days until expiry
     * as parameters to black scholes calculations
     * @param expiryTimestamp is the unix timestamp of expiry
     * @return sp is the underlying
     * @return v is the volatility
     * @return t is the days until expiry
     */
    function blackScholesParams(uint256 expiryTimestamp)
        private
        view
        returns (
            uint256 sp,
            uint256 v,
            uint256 t
        )
    {
        // chainlink oracle returns crypto / usd pairs with 8 decimals, like otoken strike price
        sp = priceOracle.latestAnswer().mul(10**8).div(
            10**priceOracle.decimals()
        );
        // annualized vol * 10 ** 8 because delta expects 18 decimals
        // and annualizedVol is 8 decimals
        v = volatilityOracle.annualizedVol().mul(10**10);
        console.log("vol is %s", v);
        t = expiryTimestamp.sub(block.timestamp).div(1 days);
    }

    /**
     * @notice Calculates the underlying assets price
     */
    function getUnderlyingPrice() external view returns (uint256 price) {
        price = priceOracle.latestAnswer();
    }
}
