import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { Contract } from "@ethersproject/contracts";
import moment from "moment-timezone";
import * as time from "../helpers/time";

const { provider, getContractFactory } = ethers;

moment.tz.setDefault("UTC");

describe("VolOracle", () => {
  let oracle: Contract;
  const PERIOD = 43200; // 12 hours
  const COMMIT_PHASE_DURATION = 1800; // 30 mins

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
      assert.equal((await oracle.twap()).toString(), "2427732358");
    });
  });

  describe("commit", () => {
    time.revertToSnapshotAfterEach();

    it("commits the twap", async function () {
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;
      const topOfPeriod = latestTimestamp - (latestTimestamp % PERIOD);

      await oracle.commit();
      let stdev = await oracle.stdev();
      assert.equal(stdev.toNumber(), 0);

      await time.increaseTo(topOfPeriod + PERIOD + 1);

      await oracle.commit();
      stdev = await oracle.stdev();
      assert.equal(stdev.toNumber(), 0);
    });

    it("reverts when out of commit phase", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;

      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION - 10);
      await expect(oracle.commit()).to.be.revertedWith("Not commit phase");

      await time.increaseTo(topOfPeriod + COMMIT_PHASE_DURATION + 10);
      await expect(oracle.commit()).to.be.revertedWith("Not commit phase");
    });

    it("commits when within commit phase", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION);
      await oracle.commit();

      const nextTopOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(nextTopOfPeriod + COMMIT_PHASE_DURATION);
      await oracle.commit();
    });

    it("fits gas budget", async function () {
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;
      const topOfPeriod = latestTimestamp - (latestTimestamp % PERIOD);

      // First time is more expensive
      const tx1 = await oracle.commit();
      const receipt1 = await tx1.wait();
      assert.isAtMost(receipt1.gasUsed.toNumber(), 60000);

      await time.increaseTo(topOfPeriod + PERIOD);

      const tx2 = await oracle.commit();
      const receipt2 = await tx2.wait();
      assert.isAtMost(receipt2.gasUsed.toNumber(), 42000);
    });
  });

  const getTopOfPeriod = async () => {
    const latestTimestamp = (await provider.getBlock("latest")).timestamp;
    let topOfPeriod: number;

    const rem = latestTimestamp % PERIOD;
    if (rem < Math.floor(PERIOD / 2)) {
      topOfPeriod = latestTimestamp - rem + PERIOD;
    } else {
      topOfPeriod = latestTimestamp + rem + PERIOD;
    }
    return topOfPeriod;
  };
});
