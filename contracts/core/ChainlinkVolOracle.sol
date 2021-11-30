//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import "@chainlink/contracts/src/v0.7/interfaces/AggregatorV3Interface.sol";
import {DSMath} from "../libraries/DSMath.sol";
import {VolOracle} from "./VolOracle.sol";

contract ChainlinkVolOracle is VolOracle {
    constructor(uint32 _period, uint256 _windowInDays)
        VolOracle(_period, _windowInDays)
    {}

    function getPrice(address priceFeed)
        public
        view
        override
        returns (uint256)
    {
        (
            uint80 roundID,
            int256 price,
            ,
            uint256 timeStamp,
            uint80 answeredInRound
        ) = AggregatorV3Interface(priceFeed).latestRoundData();

        require(answeredInRound >= roundID, "Stale oracle price");
        require(timeStamp != 0, "!timeStamp");

        // Avoid negative prices from Chainlink
        return uint256(DSMath.imax(price, 0));
    }
}
