//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {Math} from "../utils/Math.sol";

contract TestMath {
    using Math for uint256;

    function testBS(uint256 num) external view returns (uint256) {
        uint256 startgas = gasleft();
        num.bsSqrt();
        return startgas - gasleft();
    }

    function testHegic(uint256 num) external view returns (uint256) {
        uint256 startgas = gasleft();
        num.hegicSqrt();
        return startgas - gasleft();
    }

    function testPRB(uint256 num) external view returns (uint256) {
        uint256 startgas = gasleft();
        num.sqrt();
        return startgas - gasleft();
    }
}
