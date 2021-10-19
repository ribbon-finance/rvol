import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { Contract } from "ethers";
import moment from "moment-timezone";
import * as time from "../helpers/time";
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { provider, getContractFactory } = ethers;

moment.tz.setDefault("UTC");

describe("VolOracle", () => {
  let oracle: Contract;
  let mockOracle: Contract;
  let signer: SignerWithAddress;

  const PERIOD = 86400 / 2; // 12 hours
  const WINDOW_IN_DAYS = 7; // weekly vol data
  const COMMIT_PHASE_DURATION = 1800; // 30 mins
  const ethusdcPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
  // const wbtcusdcPool = "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35";

  before(async function () {
    [signer] = await ethers.getSigners();
    const VolOracle = await getContractFactory("VolOracle", signer);
    const TestVolOracle = await getContractFactory("TestVolOracle", signer);

    oracle = await VolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
    mockOracle = await TestVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
    // oracle = await VolOracle.deploy(ethusdcPool, weth, usdc);
  });

  describe("twap", () => {
    it("gets the TWAP for a period", async function () {
      assert.equal(
        (await oracle.twap(ethusdcPool)).toString(),
        "411907019541423"
      );
    });
  });

  describe("commit", () => {
    time.revertToSnapshotAfterEach();

    it("commits the twap", async function () {
      const topOfPeriod = await getTopOfPeriod();
      await time.increaseTo(topOfPeriod);
      await oracle.commit(ethusdcPool);

      const {
        lastTimestamp: timestamp1,
        mean: mean1,
        dsq: dsq1,
      } = await oracle.accumulators(ethusdcPool);
      assert.equal(timestamp1, topOfPeriod);
      assert.equal(mean1.toNumber(), 0);
      assert.equal(dsq1.toNumber(), 0);

      let stdev = await oracle.vol(ethusdcPool);
      assert.equal(stdev.toNumber(), 0);
    });

    it("reverts when out of commit phase", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;

      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION - 10);
      await expect(oracle.commit(ethusdcPool)).to.be.revertedWith(
        "Not commit phase"
      );

      await time.increaseTo(topOfPeriod + COMMIT_PHASE_DURATION + 10);
      await expect(oracle.commit(ethusdcPool)).to.be.revertedWith(
        "Not commit phase"
      );
    });

    it("reverts when there is an existing commit for period", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      await oracle.commit(ethusdcPool);

      // Cannot commit immediately after
      await expect(oracle.commit(ethusdcPool)).to.be.revertedWith("Committed");

      // Cannot commit before commit phase begins
      const beforePeriod = topOfPeriod + 100;
      await time.increaseTo(beforePeriod);
      await expect(oracle.commit(ethusdcPool)).to.be.revertedWith("Committed");

      const nextPeriod = topOfPeriod + PERIOD - COMMIT_PHASE_DURATION;
      await time.increaseTo(nextPeriod);
      await oracle.commit(ethusdcPool);
    });

    it("commits when within commit phase", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION);
      await oracle.commit(ethusdcPool);

      const nextTopOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(nextTopOfPeriod + COMMIT_PHASE_DURATION);
      await oracle.commit(ethusdcPool);
    });

    it("fits gas budget", async function () {
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;
      const topOfPeriod = latestTimestamp - (latestTimestamp % PERIOD);

      // First time is more expensive
      const tx1 = await oracle.commit(ethusdcPool);
      const receipt1 = await tx1.wait();
      assert.isAtMost(receipt1.gasUsed.toNumber(), 124559);

      await time.increaseTo(topOfPeriod + PERIOD);

      // Second time is cheaper
      const tx2 = await oracle.commit(ethusdcPool);
      const receipt2 = await tx2.wait();
      assert.isAtMost(receipt2.gasUsed.toNumber(), 72136);
    });

    it("updates the vol", async function () {
      const values = [
        BigNumber.from("2000000000"),
        BigNumber.from("2100000000"),
        BigNumber.from("2200000000"),
        BigNumber.from("2150000000"),
      ];
      const stdevs = [
        BigNumber.from("0"),
        BigNumber.from("2439508"),
        BigNumber.from("2248393"),
        BigNumber.from("3068199"),
      ];

      for (let i = 0; i < values.length; i++) {
        await mockOracle.setPrice(values[i]);
        const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
        await time.increaseTo(topOfPeriod);
        await mockOracle.mockCommit(ethusdcPool);
        let stdev = await mockOracle.vol(ethusdcPool);
        assert.equal(stdev.toString(), stdevs[i].toString());
      }
    });
  });

  describe("annualizedVol", () => {
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
        BigNumber.from("2450000000"),
        BigNumber.from("2450000000"),
        BigNumber.from("2650000000"),
      ];

      for (let i = 0; i < values.length; i++) {
        await mockOracle.setPrice(values[i]);
        const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
        await time.increaseTo(topOfPeriod);
        await mockOracle.mockCommit(ethusdcPool);
      }
      assert.equal((await mockOracle.vol(ethusdcPool)).toString(), "6607827"); // 6.6%
      assert.equal(
        (await mockOracle.annualizedVol(ethusdcPool)).toString(),
        "178411329"
      ); // 178% annually
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
