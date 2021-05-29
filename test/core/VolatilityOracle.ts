import { ethers } from "hardhat";
import { assert } from "chai";
import { Contract } from "@ethersproject/contracts";

const { getContractFactory } = ethers;

describe("VolatilityOracle", () => {
  let oracle: Contract;

  before(async function () {
    const ethusdcPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
    // const wbtcusdcPool = "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35";

    const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    // const wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
    const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    const VolatilityOracle = await getContractFactory("VolatilityOracle");
    oracle = await VolatilityOracle.deploy(ethusdcPool, weth, usdc);
    // oracle = await VolatilityOracle.deploy(ethusdcPool, weth, usdc);
  });

  describe("getHourlyTWAP", () => {
    it("gets the hourly TWAP", async function () {
      const hours = 2;
      const prices = await oracle.getHourlyTWAP(hours);
      assert.equal(prices.length, hours);
      assert.deepEqual(
        prices.map((p) => p.toString()),
        ["2428703597", "2429189362"]
      );
    });
  });
});
