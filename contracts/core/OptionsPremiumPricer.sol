//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {IVolatilityOracle} from "../interfaces/IVolatilityOracle.sol";
import {Math} from "../libraries/Math.sol";
import {Welford} from "../libraries/Welford.sol";

contract OptionsPremiumPricer {
    /**
     * Immutables
     */
    address public immutable volatilityOracle;

    constructor(address _volatilityOracle) {
        require(_volatilityOracle != address(0), "!_volatilityOracle");
        volatilityOracle = _volatilityOracle;
    }

    /**
     * @notice Calculates the premium of the provided option using Black-Scholes
     * References for Black-Scholes:
       https://www.macroption.com/black-scholes-formula/
       https://www.investopedia.com/terms/b/blackscholes.asp
     * @param underlying is the underlying asset of the option
     * @param strikePrice is the strike price of the option
     * @param expiryTimestamp is the unix timestamp of the option expiry
     * @param isPut is whether the option is a put option
     */
    function getPremium(
        address underlying,
        uint256 strikePrice,
        uint256 expiryTimestamp,
        bool isPut
    ) external view returns (uint256) {
        IVolatilityOracle volatilityOracle =
            IVolatilityOracle(volatilityOracle);
        // If call option: ..
        // If put option: ..
        return 0;
    }
}
