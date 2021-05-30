import { ethers } from "hardhat";
import { assert } from "chai";
import { Contract } from "@ethersproject/contracts";
import moment from "moment-timezone";
import * as time from "../helpers/time";

const { provider, getContractFactory } = ethers;

moment.tz.setDefault("UTC");

describe("VolOracle", () => {
  let oracle: Contract;
  const PERIOD = 7200;

  before(async function () {
    const ethusdcPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
    // const wbtcusdcPool = "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35";

    const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    // const wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
    const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    const VolOracle = await getContractFactory("VolOracle");
    oracle = await VolOracle.deploy(ethusdcPool, weth, usdc, PERIOD);
    // oracle = await VolOracle.deploy(ethusdcPool, weth, usdc);
  });

  describe("twap", () => {
    it("gets the TWAP for a period", async function () {
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;

      const expectedStart = moment(latestTimestamp * 1000)
        .minutes(0)
        .seconds(0)
        .subtract(2, "hours")
        .unix();

      const expectedEnd = moment(latestTimestamp * 1000)
        .minutes(0)
        .seconds(0)
        .unix();

      const { start, end, price } = await oracle.twap();
      assert.equal(price, "2428946467");
      assert.equal(start, expectedStart);
      assert.equal(end, expectedEnd);
    });
  });

  describe("commit", () => {
    it("commits the twap", async function () {
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;
      const topOfPeriod = latestTimestamp - (latestTimestamp % PERIOD);

      await oracle.commit();
      let stdev = await oracle.stdev();
      assert.equal(stdev.toNumber(), 0);

      await time.increaseTo(topOfPeriod + PERIOD + 1);

      await oracle.commit();
      stdev = await oracle.stdev();
      assert.equal(stdev.toNumber(), 2426398);
    });
  });
});
