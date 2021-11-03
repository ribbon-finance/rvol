//SPDX-License-Identifier: GPL-3.0
pragma solidity =0.7.3;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {OracleLibrary} from "../libraries/OracleLibrary.sol";

interface IERC20Detailed {
    function decimals() external view returns (uint8);
}

contract V3OracleHelper {
    using SafeMath for uint256;

    /// @notice ETH/USDC pool on Uniswap used to derive USDC price of asset
    address public immutable ETH_USDC_POOL =
        0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8;

    /// @notice WETH address to check if it's an ETH pool
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    /// @notice USDC address used to decide if we should check the ETH/USDC price
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    /**
     * @notice Returns the TWAP for observation period in USDC terms
     * @param pool is the Uniswap V3 pool for which we query a TWAP
     * @param twapDuration is the duration of the TWAP
     */
    function twapETHPoolForUSDCPrice(address pool, uint256 twapDuration)
        public
        view
        returns (uint256 price)
    {
        IUniswapV3Pool uniPool = IUniswapV3Pool(pool);
        address token0 = uniPool.token0();
        address token1 = uniPool.token1();
        bool isETHPair = token0 == WETH || token1 == WETH;

        if (pool == ETH_USDC_POOL || !isETHPair) {
            // If this is the ETHUSDC pool, we just use token0, which is USDC as the quoteToken
            // If we don't know whether we should use token0 or token1 as the quoteToken,
            // we just default to using token0
            return _twap(pool, token0, token1, 0, twapDuration);
        }

        uint256 quoteWithToken;
        if (token1 == WETH) {
            quoteWithToken = 1;
        }

        uint256 ethAmount = _twap(
            pool,
            token0,
            token1,
            quoteWithToken,
            twapDuration
        ); // Using ETH as the quote token

        // USDC > WETH, so USDC is token0 while WETH is token1
        uint256 ethPriceInUSDC = _twap(
            ETH_USDC_POOL,
            USDC,
            WETH,
            0,
            twapDuration
        ); // Using USDC as the quote token

        // The returned value is 10**18 * 10**6 = 10**24, so we need to get back to 10**18
        // by dividing 10**6
        return ethAmount.mul(ethPriceInUSDC).div(10**6);
    }

    /**
     * @notice Returns the TWAP for the entire Uniswap observation period
     * @param pool is the Uniswap v3 pool address
     * @param twapDuration is the duration of the TWAP
     * @return price is the TWAP quoted in quote currency
     */
    function twap(address pool, uint256 twapDuration)
        external
        view
        returns (uint256 price)
    {
        IUniswapV3Pool uniPool = IUniswapV3Pool(pool);
        return _twap(pool, uniPool.token0(), uniPool.token1(), 0, twapDuration);
    }

    /**
     * @notice Returns the TWAP for the entire Uniswap observation period
     * @param pool is the Uniswap v3 pool
     * @param token0 is the token0 of the v3 pool, saves gas by passing it in
     * @param token1 is the token1 of the v3 pool, saves gas by passing it in
     * @param quoteWithTokenIndex is the either 0 or 1
     * @param twapDuration is the duration of the TWAP
     * @return price is the TWAP quoted in quote currency
     */
    function _twap(
        address pool,
        address token0,
        address token1,
        uint256 quoteWithTokenIndex,
        uint256 twapDuration
    ) internal view returns (uint256 price) {
        require(
            quoteWithTokenIndex == 0 || quoteWithTokenIndex == 1,
            "quoteWithTokenIndex needs to be 0 or 1"
        );

        (int24 tick, ) = OracleLibrary.consult(pool, uint32(twapDuration));

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
                tick,
                uint128(baseTokenAmount),
                baseToken,
                quoteToken
            );
    }

    /**
     * @notice Convenience function to avoid .decimal lookups, but falls back if not in
     * lookup table. For non-mainnet it will just fallback on looking up via decimals()
     * @param asset for the decimals to lookup for
     * @return the number of decimals
     */
    function _lookupDecimals(address asset) internal view returns (uint256) {
        if (asset == 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2) {
            // WETH
            return 18;
        } else if (asset == 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599) {
            // WBTC
            return 8;
        } else if (asset == 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48) {
            // USDC
            return 6;
        }
        // Fallback to actually performing a storage read
        return IERC20Detailed(asset).decimals();
    }
}
