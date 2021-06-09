//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {IVolatilityOracle} from "../interfaces/IVolatilityOracle.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {ICompToken} from "../interfaces/ICompToken.sol";
import {IERC20Detailed} from "../interfaces/IERC20Detailed.sol";
import {Math} from "../libraries/Math.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Welford} from "../libraries/Welford.sol";

contract OptionsPremiumPricer {
    using SafeMath for uint256;

    /**
     * Immutables
     */
    IVolatilityOracle public immutable volatilityOracle;
    IPriceOracle public immutable priceOracle;
    ICompToken public immutable cToken;

    constructor(
        address _volatilityOracle,
        address _priceOracle,
        address _cToken
    ) {
        require(_volatilityOracle != address(0), "!_volatilityOracle");
        require(_priceOracle != address(0), "!_priceOracle");
        require(_cToken != address(0), "!_cToken");
        volatilityOracle = IVolatilityOracle(_volatilityOracle);
        priceOracle = IPriceOracle(_priceOracle);
        cToken = ICompToken(_cToken);
    }

    /**
     * @notice Calculates the premium of the provided option using Black-Scholes
     * References for Black-Scholes:
       https://www.macroption.com/black-scholes-formula/
       https://www.investopedia.com/terms/b/blackscholes.asp
     * @param st is the strike price of the option
     * @param t is the time to expiration in years
     * @param isPut is whether the option is a put option
     */
    function getPremium(
        uint256 st,
        uint256 t,
        bool isPut
    ) external returns (uint256 premium) {
        volatilityOracle.commit();

        uint256 sp = priceOracle.latestAnswer().div(priceOracle.decimals());
        uint256 v = volatilityOracle.vol();
        uint256 rf = getAssetRiskFreeRate();

        if (sp > st) {
            premium = getBlackScholesPrice(t, v, sp, st);
            premium = isPut ? st - sp + premium : premium;
        } else {
            premium = getBlackScholesPrice(t, v, st, sp);
            premium = isPut ? premium : st - sp + premium;
        }
    }

    function getBlackScholesPrice(
        uint256 t,
        uint256 v,
        uint256 sp,
        uint256 st
    ) private view returns (uint256) {
        if (sp == st) {
            return
                (((((Math.LNX * sp) / 1e10) * v) / 1e18) *
                    Math.sqrt2((1e18 * t) / 365)) / 1e9;
        }
        uint256 sigma = ((v**2) / 2);
        uint256 sigmaB = 1e36;

        uint256 sig = (((1e18 * sigma) / sigmaB) * t) / 365;

        uint256 sSQRT = (v * Math.sqrt2((1e18 * t) / 365)) / 1e9;

        uint256 d1 = (1e18 * Math.ln((Math.FIXED_1 * sp) / st)) / Math.FIXED_1;
        d1 = ((d1 + sig) * 1e18) / sSQRT;
        uint256 d2 = d1 - sSQRT;

        uint256 cdfD1 = Math.ncdf((Math.FIXED_1 * d1) / 1e18);
        uint256 cdfD2 = Math.cdf((int256(Math.FIXED_1) * int256(d2)) / 1e18);

        return (sp * cdfD1) / 1e14 - (st * cdfD2) / 1e14;
    }

    /**
     * @notice Calculates the risk free interest rate on the premium underlying asset
     * using Compounds's risk free interest rate
     * Formula reference: https://compound.finance/docs (Calculating the APY Using Rate Per Block)
     */
    function getAssetRiskFreeRate() private view returns (uint256 apy) {
        uint256 supplyRate = cToken.supplyRatePerBlock();
        uint256 assetMantissa =
            10**IERC20Detailed(volatilityOracle.baseCurrency()).decimals();
        uint256 blocksPerDay = 6570;
        apy = ((supplyRate.div(assetMantissa.mul(blocksPerDay).add(1)))**365)
            .sub(1)
            .mul(100);
    }

    /**
     * @notice Calculates the option's delta
     * Formula reference: `d_1` in https://www.investopedia.com/terms/b/blackscholes.asp
     * http://www.optiontradingpedia.com/options_delta.htm
     * @param st is the strike price of the option
     * @param t is the time to expiration in years
     */
    function getOptionDelta(uint256 st, uint256 t)
        external
        view
        returns (uint256 delta)
    {
        uint256 v = volatilityOracle.vol();
        uint256 sp = priceOracle.latestAnswer().div(priceOracle.decimals());

        uint256 sigma = ((v**2) / 2);
        uint256 sigmaB = 1e36;

        uint256 sig = (((1e18 * sigma) / sigmaB) * t) / 365;

        uint256 sSQRT = (v * Math.sqrt2((1e18 * t) / 365)) / 1e9;

        uint256 d1 = (1e18 * Math.ln((Math.FIXED_1 * sp) / st)) / Math.FIXED_1;
        d1 = ((d1 + sig) * 1e18) / sSQRT;

        delta = Math.ncdf((Math.FIXED_1 * d1) / 1e18);
    }

    /**
     * @notice Calculates the underlying assets price
     */
    function getUnderlyingPrice() external view returns (uint256 price) {
        price = priceOracle.latestAnswer().div(priceOracle.decimals());
    }
}
