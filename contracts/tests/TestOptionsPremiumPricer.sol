//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {OptionsPremiumPricer} from "../core/OptionsPremiumPricer.sol";

contract TestOptionsPremiumPricer is OptionsPremiumPricer {
    constructor(
        address _pool,
        address _volatilityOracle,
        address _priceOracle,
        address _stablesOracle
    )
        OptionsPremiumPricer(
            _pool,
            _volatilityOracle,
            _priceOracle,
            _stablesOracle
        )
    {}

    function testGetPremium(
        uint256 st,
        uint256 expiryTimestamp,
        bool isPut
    ) external view returns (uint256 result, uint256 gas) {
        bytes memory data =
            abi.encodeWithSelector(
                this.getPremium.selector,
                st,
                expiryTimestamp,
                isPut
            );

        uint256 startgas = gasleft();
        (bool success, bytes memory returnData) =
            address(this).staticcall(data);
        gas = startgas - gasleft();

        result = 0;
        if (success) {
            result = abi.decode(returnData, (uint256));
        }
    }

    function testGetOptionDelta(uint256 st, uint256 expiryTimestamp)
        external
        view
        returns (uint256 result, uint256 gas)
    {
        bytes memory data =
            abi.encodeWithSelector(
                this.getOptionDelta.selector,
                st,
                expiryTimestamp
            );

        uint256 startgas = gasleft();
        (bool success, bytes memory returnData) =
            address(this).staticcall(data);
        gas = startgas - gasleft();

        result = 0;
        if (success) {
            result = abi.decode(returnData, (uint256));
        }
    }
}
