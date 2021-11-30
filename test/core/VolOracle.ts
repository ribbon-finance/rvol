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
  const usdcEthPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
  const usdcEthPriceFeed = "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4";

  before(async function () {
    [signer] = await ethers.getSigners();
    const V3TwapVolOracle = await getContractFactory("V3TwapVolOracle", signer);
    const ChainlinkVolOracle = await getContractFactory("ChainlinkVolOracle", signer);
    const TestVolOracle = await getContractFactory("TestVolOracle", signer);

    v3TwapOracle = await V3TwapVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
    chainlinkOracle = await ChainlinkVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
    mockOracle = await TestVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
  });

  describe("getPrice", () => {
    it("v3TwapVolOracle: gets the TWAP for a period", async function () {
      assert.equal(
        (await v3TwapOracle.getPrice(usdcEthPool)).toString(),
        "411907019541423"
      );
    });
    it("chainlinkOracle: gets the price feed for a period", async function () {
      assert.equal(
        (await chainlinkOracle.getPrice(usdcEthPriceFeed)).toString(),
        "413530668408711"
      );
    });
  });

  describe("initPool", () => {
    time.revertToSnapshotAfterEach();

    it("v3TwapOracle: initializes pool", async function () {
      await expect(v3TwapOracle.commit(usdcEthPool)).to.be.revertedWith(
        "!pool initialize"
      );
      await v3TwapOracle.initPool(usdcEthPool);
      v3TwapOracle.commit(usdcEthPool);
    });

    it("v3TwapOracle: reverts when pool has already been initialized", async function () {
      await v3TwapOracle.initPool(usdcEthPool);
      await expect(v3TwapOracle.initPool(usdcEthPool)).to.be.revertedWith(
        "Pool initialized"
      );
    });

    it("chainlinkOracle: initializes pool", async function () {
      await expect(chainlinkOracle.commit(usdcEthPriceFeed)).to.be.revertedWith(
        "!pool initialize"
      );
      await chainlinkOracle.initPool(usdcEthPriceFeed);
      chainlinkOracle.commit(usdcEthPriceFeed);
    });

    it("chainlinkOracle: reverts when pool has already been initialized", async function () {
      await chainlinkOracle.initPool(usdcEthPriceFeed);
      await expect(chainlinkOracle.initPool(usdcEthPriceFeed)).to.be.revertedWith(
        "Pool initialized"
      );
    });

  });

  describe("commit", () => {
    time.revertToSnapshotAfterEach();

    it("v3TwapOracle: commits the twap", async function () {
      await v3TwapOracle.initPool(usdcEthPool);
      const topOfPeriod = await getTopOfPeriod();
      await time.increaseTo(topOfPeriod);
      await v3TwapOracle.commit(usdcEthPool);

      const {
        lastTimestamp: timestamp1,
        mean: mean1,
        dsq: dsq1,
      } = await v3TwapOracle.accumulators(usdcEthPool);
      assert.equal(timestamp1, topOfPeriod);
      assert.equal(mean1.toNumber(), 0);
      assert.equal(dsq1.toNumber(), 0);

      let stdev = await v3TwapOracle.vol(usdcEthPool);
      assert.equal(stdev.toNumber(), 0);
    });

    it("chainlinkOracle: commits the price", async function () {
      await chainlinkOracle.initPool(usdcEthPriceFeed);
      const topOfPeriod = await getTopOfPeriod();
      await time.increaseTo(topOfPeriod);
      await chainlinkOracle.commit(usdcEthPriceFeed);

      const {
        lastTimestamp: timestamp1,
        mean: mean1,
        dsq: dsq1,
      } = await chainlinkOracle.accumulators(usdcEthPriceFeed);
      assert.equal(timestamp1, topOfPeriod);
      assert.equal(mean1.toNumber(), 0);
      assert.equal(dsq1.toNumber(), 0);

      let stdev = await chainlinkOracle.vol(usdcEthPriceFeed);
      assert.equal(stdev.toNumber(), 0);
    });

    it("v3TwapOracle: reverts when out of commit phase", async function () {
      await v3TwapOracle.initPool(usdcEthPool);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;

      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION - 10);
      await expect(v3TwapOracle.commit(usdcEthPool)).to.be.revertedWith(
        "Not commit phase"
      );

      await time.increaseTo(topOfPeriod + COMMIT_PHASE_DURATION + 10);
      await expect(v3TwapOracle.commit(usdcEthPool)).to.be.revertedWith(
        "Not commit phase"
      );
    });

    it("chainlinkOracle: reverts when out of commit phase", async function () {
      await chainlinkOracle.initPool(usdcEthPriceFeed);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;

      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION - 10);
      await expect(chainlinkOracle.commit(usdcEthPriceFeed)).to.be.revertedWith(
        "Not commit phase"
      );

      await time.increaseTo(topOfPeriod + COMMIT_PHASE_DURATION + 10);
      await expect(chainlinkOracle.commit(usdcEthPriceFeed)).to.be.revertedWith(
        "Not commit phase"
      );
    });

    it("v3TwapOracle: reverts when there is an existing commit for period", async function () {
      await v3TwapOracle.initPool(usdcEthPool);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      await v3TwapOracle.commit(usdcEthPool);

      // Cannot commit immediately after
      await expect(v3TwapOracle.commit(usdcEthPool)).to.be.revertedWith("Committed");

      // Cannot commit before commit phase begins
      const beforePeriod = topOfPeriod + 100;
      await time.increaseTo(beforePeriod);
      await expect(v3TwapOracle.commit(usdcEthPool)).to.be.revertedWith("Committed");

      const nextPeriod = topOfPeriod + PERIOD - COMMIT_PHASE_DURATION;
      await time.increaseTo(nextPeriod);
      await v3TwapOracle.commit(usdcEthPool);
    });

    it("chainlinkOracle: reverts when there is an existing commit for period", async function () {
      await chainlinkOracle.initPool(usdcEthPriceFeed);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      await chainlinkOracle.commit(usdcEthPriceFeed);

      // Cannot commit immediately after
      await expect(chainlinkOracle.commit(usdcEthPriceFeed)).to.be.revertedWith("Committed");

      // Cannot commit before commit phase begins
      const beforePeriod = topOfPeriod + 100;
      await time.increaseTo(beforePeriod);
      await expect(chainlinkOracle.commit(usdcEthPriceFeed)).to.be.revertedWith("Committed");

      const nextPeriod = topOfPeriod + PERIOD - COMMIT_PHASE_DURATION;
      await time.increaseTo(nextPeriod);
      await chainlinkOracle.commit(usdcEthPriceFeed);
    });

    it("v3TwapOracle: reverts when pool has not been initialized", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      // Cannot commit immediately after
      await expect(v3TwapOracle.commit(usdcEthPool)).to.be.revertedWith(
        "!pool initialize"
      );
    });

    it("v3TwapOracle: reverts when pool has not been initialized", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      // Cannot commit immediately after
      await expect(v3TwapOracle.commit(usdcEthPool)).to.be.revertedWith(
        "!pool initialize"
      );
    });

    it("chainlinkOracle: commits when within commit phase", async function () {
      await chainlinkOracle.initPool(usdcEthPriceFeed);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION);
      await chainlinkOracle.commit(usdcEthPriceFeed);

      const nextTopOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(nextTopOfPeriod + COMMIT_PHASE_DURATION);
      await chainlinkOracle.commit(usdcEthPriceFeed);
    });

    it("v3TwapOracle: fits gas budget", async function () {
      await v3TwapOracle.initPool(usdcEthPool);
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;
      const topOfPeriod = latestTimestamp - (latestTimestamp % PERIOD);

      // First time is more expensive
      const tx1 = await v3TwapOracle.commit(usdcEthPool);
      const receipt1 = await tx1.wait();
      assert.isAtMost(receipt1.gasUsed.toNumber(), 156538);

      await time.increaseTo(topOfPeriod + PERIOD);

      // Second time is cheaper
      const tx2 = await v3TwapOracle.commit(usdcEthPool);
      const receipt2 = await tx2.wait();
      assert.isAtMost(receipt2.gasUsed.toNumber(), 72984);
    });

    it("chainlinkOracle: fits gas budget", async function () {
      await chainlinkOracle.initPool(usdcEthPriceFeed);
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;
      const topOfPeriod = latestTimestamp - (latestTimestamp % PERIOD);

      // First time is more expensive
      const tx1 = await chainlinkOracle.commit(usdcEthPriceFeed);
      const receipt1 = await tx1.wait();
      assert.isAtMost(receipt1.gasUsed.toNumber(), 96238);

      await time.increaseTo(topOfPeriod + PERIOD);

      // Second time is cheaper
      const tx2 = await chainlinkOracle.commit(usdcEthPriceFeed);
      const receipt2 = await tx2.wait();
      assert.isAtMost(receipt2.gasUsed.toNumber(), 60911);
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

      await mockOracle.initPool(usdcEthPool);

      for (let i = 0; i < values.length; i++) {
        await mockOracle.setPrice(values[i]);
        const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
        await time.increaseTo(topOfPeriod);
        await mockOracle.mockCommit(usdcEthPool);
        let stdev = await mockOracle.vol(usdcEthPool);
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

      await mockOracle.initPool(usdcEthPool);

      for (let i = 0; i < values.length; i++) {
        await mockOracle.setPrice(values[i]);
        const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
        await time.increaseTo(topOfPeriod);
        await mockOracle.mockCommit(usdcEthPool);
      }
      assert.equal((await mockOracle.vol(usdcEthPool)).toString(), "6607827"); // 6.6%
      assert.equal(
        (await mockOracle.annualizedVol(usdcEthPool)).toString(),
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
