//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {Math} from "../libraries/Math.sol";

contract TestMath {
    using Math for uint256;

    function testStdev(uint256[] calldata nums)
        external
        view
        returns (uint256 result, uint256 gas)
    {
        uint256 startgas = gasleft();
        result = Math.stddev(nums);
        gas = startgas - gasleft();
    }

    function testPRB(uint256 num) external view returns (uint256) {
        uint256 startgas = gasleft();
        num.sqrt();
        return startgas - gasleft();
    }

    function testLn(uint256 num)
        external
        view
        returns (uint256 result, uint256 gas)
    {
        uint256 startgas = gasleft();
        result = num.ln();
        gas = startgas - gasleft();
    }
}
