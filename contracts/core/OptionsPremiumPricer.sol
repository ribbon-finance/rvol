//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {IVolatilityOracle} from "../interfaces/IVolatilityOracle.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {ICompToken} from "../interfaces/ICompToken.sol";
import {DSMath} from "../libraries/DSMath.sol";
import {IBlackScholes} from "../interfaces/IBlackScholes.sol";
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
    ICompToken public immutable cToken;
    // IKEEP3rVolatility: 0xCCdfCB72753CfD55C5afF5d98eA5f9C43be9659d
    IBlackScholes public immutable blackScholes;

    constructor(
        address _volatilityOracle,
        address _priceOracle,
        address _cToken,
        address _blackScholes
    ) {
        require(_volatilityOracle != address(0), "!_volatilityOracle");
        require(_priceOracle != address(0), "!_priceOracle");
        require(_cToken != address(0), "!_cToken");
        require(_blackScholes != address(0), "!_blackScholes");
        volatilityOracle = IVolatilityOracle(_volatilityOracle);
        priceOracle = IPriceOracle(_priceOracle);
        cToken = ICompToken(_cToken);
        blackScholes = IBlackScholes(_blackScholes);
    }

    /**
     * @notice Calculates the premium of the provided option using Black-Scholes
     * References for Black-Scholes:
       https://www.macroption.com/black-scholes-formula/
       https://www.investopedia.com/terms/b/blackscholes.asp
     * @param st is the strike price of the option
     * @param expiryTimestamp is the unix timestamp of expiry
     * @param isPut is whether the option is a put option
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

        uint256 sp = priceOracle.latestAnswer().div(10**priceOracle.decimals());
        uint256 v = volatilityOracle.vol();
        uint256 t = expiryTimestamp.sub(block.timestamp).div(1 days);

        console.log("strike price is %s", st);
        console.log("underlying price is %s", sp);
        console.log("volatility is %s", v);
        console.log("time to expiry in days is %s", t);

        (uint256 call, uint256 put) = blackScholes.quoteAll(t, v, sp, st);
        console.log("call option price is %s", call);
        console.log("put option price is %s", put);

        premium = !isPut ? call : put;
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
        apy = wdiv(
            sub(
                (
                    rpow(
                        add(
                            assetMantissa.mul(assetMantissa),
                            wdiv(supplyRate, wmul(assetMantissa, blocksPerDay))
                        ),
                        365
                    )
                ),
                assetMantissa.mul(assetMantissa)
            ),
            assetMantissa.mul(assetMantissa)
        )
            .mul(100);
    }

    /**
     * @notice Calculates the option's delta
     * Formula reference: `d_1` in https://www.investopedia.com/terms/b/blackscholes.asp
     * http://www.optiontradingpedia.com/options_delta.htm
     * https://www.macroption.com/black-scholes-formula/
     * @param st is the strike price of the option
     * @param expiryTimestamp is the unix timestamp of expiry
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

        uint256 sp = priceOracle.latestAnswer().div(priceOracle.decimals());
        uint256 v = volatilityOracle.vol();
        uint256 t = expiryTimestamp.sub(block.timestamp).div(1 days);

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
        price = priceOracle.latestAnswer().div(10**priceOracle.decimals());
    }
}
