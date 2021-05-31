# RVOL

RVOL (Ribbon Volatility) is a set of Solidity libraries and tools that utilizes Uniswap v3 to make on-chain volatility data accessible.

Its goals are to help builders for:

- Building on-chain volatility indices
- Querying realized volatility information
- Pricing derivatives and options with on-chain data

The RVOL library intends to have the below features:

- Realized volatility oracles for any Uniswap v3 pool
- Options pricing with Black Scholes for Uniswap v3 pool
- Index pricing with oracles

## The Problem

On-chain options products such as [Hegic](https://www.hegic.co/) and [Siren](https://sirenmarkets.com/) need to rely on historical volatility of an asset to correctly price an option.

The problem here is two-fold:

- There are no good ways to measure historical volatility on-chain. Hence, option contracts manually set an off-chain volatility number which is routinely updated. This breaks the trustless nature of these protocols.

- Measuring daily volatility requires a TWAP, which oracle alternatives such as Chainlink do not offer.

To solve these issues, RVOL uses Uniswap v3's TWAP oracle to measure the daily volatility of an asset.

## Team

RVOL is built by the [Ribbon Finance](http://ribbon.finance/) team.

## Licensing

GPL 3.0, see LICENSE file.
