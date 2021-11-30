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
  let v3TwapOracle: Contract;
  let chainlinkOracle: Contract;
  let mockOracle: Contract;
  let signer: SignerWithAddress;

  const PERIOD = 86400 / 2; // 12 hours
  const WINDOW_IN_DAYS = 7; // weekly vol data
  const COMMIT_PHASE_DURATION = 1800; // 30 mins
  const ethusdcPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
  const ethusdcPriceFeed = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  // const wbtcusdcPool = "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35";

  before(async function () {
    [signer] = await ethers.getSigners();
    const V3TwapVolOracle = await getContractFactory("V3TwapVolOracle", signer);
    const ChainlinkVolOracle = await getContractFactory("ChainlinkVolOracle", signer);
    const TestVolOracle = await getContractFactory("TestVolOracle", signer);

    v3TwapOracle = await V3TwapVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
    chainlinkOracle = await ChainlinkVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
    mockOracle = await TestVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
  });

  describe("twap", () => {
    it("v3TwapVolOracle: gets the TWAP for a period", async function () {
      assert.equal(
        (await v3TwapOracle.getPrice(ethusdcPool)).toString(),
        "411907019541423"
      );
    });
    it("chainlinkOracle: gets the price feed for a period", async function () {
      assert.equal(
        (await chainlinkOracle.getPrice(ethusdcPriceFeed)).toString(),
        "241664000000"
      );
    });
  });

  describe("initPool", () => {
    time.revertToSnapshotAfterEach();

    it("v3TwapOracle: initializes pool", async function () {
      await expect(v3TwapOracle.commit(ethusdcPool)).to.be.revertedWith(
        "!pool initialize"
      );
      await v3TwapOracle.initPool(ethusdcPool);
      v3TwapOracle.commit(ethusdcPool);
    });

    it("v3TwapOracle: reverts when pool has already been initialized", async function () {
      await v3TwapOracle.initPool(ethusdcPool);
      await expect(v3TwapOracle.initPool(ethusdcPool)).to.be.revertedWith(
        "Pool initialized"
      );
    });

    it("chainlinkOracle: initializes pool", async function () {
      await expect(chainlinkOracle.commit(ethusdcPriceFeed)).to.be.revertedWith(
        "!pool initialize"
      );
      await chainlinkOracle.initPool(ethusdcPriceFeed);
      chainlinkOracle.commit(ethusdcPriceFeed);
    });

    it("chainlinkOracle: reverts when pool has already been initialized", async function () {
      await chainlinkOracle.initPool(ethusdcPriceFeed);
      await expect(chainlinkOracle.initPool(ethusdcPriceFeed)).to.be.revertedWith(
        "Pool initialized"
      );
    });

  });

  describe("commit", () => {
    time.revertToSnapshotAfterEach();

    it("v3TwapOracle: commits the twap", async function () {
      await v3TwapOracle.initPool(ethusdcPool);
      const topOfPeriod = await getTopOfPeriod();
      await time.increaseTo(topOfPeriod);
      await v3TwapOracle.commit(ethusdcPool);

      const {
        lastTimestamp: timestamp1,
        mean: mean1,
        dsq: dsq1,
      } = await v3TwapOracle.accumulators(ethusdcPool);
      assert.equal(timestamp1, topOfPeriod);
      assert.equal(mean1.toNumber(), 0);
      assert.equal(dsq1.toNumber(), 0);

      let stdev = await v3TwapOracle.vol(ethusdcPool);
      assert.equal(stdev.toNumber(), 0);
    });

    it("chainlinkOracle: commits the price", async function () {
      await chainlinkOracle.initPool(ethusdcPriceFeed);
      const topOfPeriod = await getTopOfPeriod();
      await time.increaseTo(topOfPeriod);
      await chainlinkOracle.commit(ethusdcPriceFeed);

      const {
        lastTimestamp: timestamp1,
        mean: mean1,
        dsq: dsq1,
      } = await chainlinkOracle.accumulators(ethusdcPriceFeed);
      assert.equal(timestamp1, topOfPeriod);
      assert.equal(mean1.toNumber(), 0);
      assert.equal(dsq1.toNumber(), 0);

      let stdev = await chainlinkOracle.vol(ethusdcPriceFeed);
      assert.equal(stdev.toNumber(), 0);
    });

    it("v3TwapOracle: reverts when out of commit phase", async function () {
      await v3TwapOracle.initPool(ethusdcPool);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;

      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION - 10);
      await expect(v3TwapOracle.commit(ethusdcPool)).to.be.revertedWith(
        "Not commit phase"
      );

      await time.increaseTo(topOfPeriod + COMMIT_PHASE_DURATION + 10);
      await expect(v3TwapOracle.commit(ethusdcPool)).to.be.revertedWith(
        "Not commit phase"
      );
    });

    it("chainlinkOracle: reverts when out of commit phase", async function () {
      await chainlinkOracle.initPool(ethusdcPriceFeed);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;

      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION - 10);
      await expect(chainlinkOracle.commit(ethusdcPriceFeed)).to.be.revertedWith(
        "Not commit phase"
      );

      await time.increaseTo(topOfPeriod + COMMIT_PHASE_DURATION + 10);
      await expect(chainlinkOracle.commit(ethusdcPriceFeed)).to.be.revertedWith(
        "Not commit phase"
      );
    });

    it("v3TwapOracle: reverts when there is an existing commit for period", async function () {
      await v3TwapOracle.initPool(ethusdcPool);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      await v3TwapOracle.commit(ethusdcPool);

      // Cannot commit immediately after
      await expect(v3TwapOracle.commit(ethusdcPool)).to.be.revertedWith("Committed");

      // Cannot commit before commit phase begins
      const beforePeriod = topOfPeriod + 100;
      await time.increaseTo(beforePeriod);
      await expect(v3TwapOracle.commit(ethusdcPool)).to.be.revertedWith("Committed");

      const nextPeriod = topOfPeriod + PERIOD - COMMIT_PHASE_DURATION;
      await time.increaseTo(nextPeriod);
      await v3TwapOracle.commit(ethusdcPool);
    });

    it("chainlinkOracle: reverts when there is an existing commit for period", async function () {
      await chainlinkOracle.initPool(ethusdcPriceFeed);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      await chainlinkOracle.commit(ethusdcPriceFeed);

      // Cannot commit immediately after
      await expect(chainlinkOracle.commit(ethusdcPriceFeed)).to.be.revertedWith("Committed");

      // Cannot commit before commit phase begins
      const beforePeriod = topOfPeriod + 100;
      await time.increaseTo(beforePeriod);
      await expect(chainlinkOracle.commit(ethusdcPriceFeed)).to.be.revertedWith("Committed");

      const nextPeriod = topOfPeriod + PERIOD - COMMIT_PHASE_DURATION;
      await time.increaseTo(nextPeriod);
      await chainlinkOracle.commit(ethusdcPriceFeed);
    });

    it("v3TwapOracle: reverts when pool has not been initialized", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      // Cannot commit immediately after
      await expect(v3TwapOracle.commit(ethusdcPool)).to.be.revertedWith(
        "!pool initialize"
      );
    });

    it("v3TwapOracle: reverts when pool has not been initialized", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      // Cannot commit immediately after
      await expect(v3TwapOracle.commit(ethusdcPool)).to.be.revertedWith(
        "!pool initialize"
      );
    });

    it("chainlinkOracle: commits when within commit phase", async function () {
      await chainlinkOracle.initPool(ethusdcPriceFeed);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION);
      await chainlinkOracle.commit(ethusdcPriceFeed);

      const nextTopOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(nextTopOfPeriod + COMMIT_PHASE_DURATION);
      await chainlinkOracle.commit(ethusdcPriceFeed);
    });

    it("v3TwapOracle: fits gas budget", async function () {
      await v3TwapOracle.initPool(ethusdcPool);
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;
      const topOfPeriod = latestTimestamp - (latestTimestamp % PERIOD);

      // First time is more expensive
      const tx1 = await v3TwapOracle.commit(ethusdcPool);
      const receipt1 = await tx1.wait();
      assert.isAtMost(receipt1.gasUsed.toNumber(), 156538);

      await time.increaseTo(topOfPeriod + PERIOD);

      // Second time is cheaper
      const tx2 = await v3TwapOracle.commit(ethusdcPool);
      const receipt2 = await tx2.wait();
      assert.isAtMost(receipt2.gasUsed.toNumber(), 72984);
    });

    it("chainlinkOracle: fits gas budget", async function () {
      await chainlinkOracle.initPool(ethusdcPriceFeed);
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;
      const topOfPeriod = latestTimestamp - (latestTimestamp % PERIOD);

      // First time is more expensive
      const tx1 = await chainlinkOracle.commit(ethusdcPriceFeed);
      const receipt1 = await tx1.wait();
      assert.isAtMost(receipt1.gasUsed.toNumber(), 156538);

      await time.increaseTo(topOfPeriod + PERIOD);

      // Second time is cheaper
      const tx2 = await chainlinkOracle.commit(ethusdcPriceFeed);
      const receipt2 = await tx2.wait();
      assert.isAtMost(receipt2.gasUsed.toNumber(), 72984);
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

      await mockOracle.initPool(ethusdcPool);

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

      await mockOracle.initPool(ethusdcPool);

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
