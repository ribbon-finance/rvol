import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { Contract } from "@ethersproject/contracts";
import moment from "moment-timezone";
import * as time from "../helpers/time";
import * as math from "../helpers/math";
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { parseEther } from "@ethersproject/units";

const { provider, getContractFactory } = ethers;

moment.tz.setDefault("UTC");

describe("VolOracle", () => {
  let oracle: Contract;
  let mockOracle: Contract;
  let signer: SignerWithAddress;

  const PERIOD = 43200; // 12 hours
  const COMMIT_PHASE_DURATION = 1800; // 30 mins
  const ethusdcPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
  // const wbtcusdcPool = "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35";

  const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  // const wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
  const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  before(async function () {
    [signer] = await ethers.getSigners();
    const VolOracle = await getContractFactory("VolOracle", signer);
    const TestVolOracle = await getContractFactory("TestVolOracle", signer);

    oracle = await VolOracle.deploy(ethusdcPool, weth, usdc, PERIOD);
    mockOracle = await TestVolOracle.deploy(ethusdcPool, weth, usdc, PERIOD);
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
      const topOfPeriod = await getTopOfPeriod();
      await time.increaseTo(topOfPeriod);
      await oracle.commit();

      const {
        count: count1,
        lastTimestamp: timestamp1,
        mean: mean1,
        m2: m2_1,
      } = await oracle.accumulator();
      assert.equal(count1, 1);
      assert.equal(timestamp1, topOfPeriod);
      assert.equal(mean1.toNumber(), 0);
      assert.equal(m2_1.toNumber(), 0);

      let stdev = await oracle.stdev();
      assert.equal(stdev.toNumber(), 0);
    });

    it("reverts when out of commit phase", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;

      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION - 10);
      await expect(oracle.commit()).to.be.revertedWith("Not commit phase");

      await time.increaseTo(topOfPeriod + COMMIT_PHASE_DURATION + 10);
      await expect(oracle.commit()).to.be.revertedWith("Not commit phase");
    });

    it("reverts when there is an existing commit for period", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      await oracle.commit();

      // Cannot commit immediately after
      await expect(oracle.commit()).to.be.revertedWith("Committed");

      // Cannot commit before commit phase begins
      const beforePeriod = topOfPeriod + 100;
      await time.increaseTo(beforePeriod);
      await expect(oracle.commit()).to.be.revertedWith("Committed");

      const nextPeriod = topOfPeriod + PERIOD - COMMIT_PHASE_DURATION;
      await time.increaseTo(nextPeriod);
      await oracle.commit();
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
      assert.isAtMost(receipt1.gasUsed.toNumber(), 84000);

      await time.increaseTo(topOfPeriod + PERIOD);

      const tx2 = await oracle.commit();
      const receipt2 = await tx2.wait();
      assert.isAtMost(receipt2.gasUsed.toNumber(), 46000);
    });

    it("updates the stdev", async function () {
      const values = [
        BigNumber.from("2000000000"),
        BigNumber.from("2100000000"),
        BigNumber.from("2200000000"),
        BigNumber.from("2150000000"),
      ];
      const stdevs = [
        BigNumber.from("0"),
        BigNumber.from("20815054591668398"),
        BigNumber.from("20192866474873522"),
        BigNumber.from("22905638409289836"),
      ];

      for (let i = 0; i < values.length; i++) {
        await mockOracle.setPrice(values[i]);
        const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
        await time.increaseTo(topOfPeriod);
        await mockOracle.mockCommit();
        let stdev = await mockOracle.stdev();
        assert.equal(stdev.toString(), stdevs[i].toString());
      }
    });
  });

  describe("annualizedStdev", () => {
    it("returns the annual stdev", async function () {
      const values = [
        BigNumber.from("2000000000"),
        BigNumber.from("2100000000"),
        BigNumber.from("2200000000"),
        BigNumber.from("2150000000"),
        BigNumber.from("2250000000"),
        BigNumber.from("2350000000"),
        BigNumber.from("2450000000"),
        BigNumber.from("2550000000"),
        BigNumber.from("2350000000"),
        BigNumber.from("2450000000"),
        BigNumber.from("2250000000"),
        BigNumber.from("2250000000"),
        BigNumber.from("2650000000"),
      ];

      for (let i = 0; i < values.length; i++) {
        await mockOracle.setPrice(values[i]);
        const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
        await time.increaseTo(topOfPeriod);
        await mockOracle.mockCommit();
      }
      assert.equal(
        (await mockOracle.annualizedStdev()).toString(),
        "281128406353999938"
      );
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
