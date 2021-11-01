import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { Contract } from "ethers";
import moment from "moment-timezone";
import * as time from "../helpers/time";
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { provider, getContractFactory } = ethers;

moment.tz.setDefault("UTC");

const PERIOD = 86400 / 2; // 12 hours
const WINDOW_IN_DAYS = 7; // weekly vol data
const COMMIT_PHASE_DURATION = 1800; // 30 mins
const ETH_USDC_POOL = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";

describe("VolOracle", () => {
  // const wbtcusdcPool = "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35";

  behavesLikeVolOracle({
    poolAddress: ETH_USDC_POOL,
  });

  behavesLikeMockOracle();
});

function behavesLikeVolOracle({ poolAddress }: { poolAddress: string }) {
  let oracle: Contract;
  let signer: SignerWithAddress;

  before(async function () {
    [signer] = await ethers.getSigners();
    const VolOracle = await getContractFactory("VolOracle", signer);
    oracle = await VolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
  });

  describe("twap", () => {
    it("gets the TWAP for a period", async function () {
      assert.equal(
        (await oracle.twap(poolAddress)).toString(),
        "411907019541423"
      );
    });
  });

  describe("initPool", () => {
    time.revertToSnapshotAfterEach();

    it("initializes pool", async function () {
      await expect(oracle.commit(poolAddress)).to.be.revertedWith(
        "!pool initialize"
      );
      await oracle.initPool(poolAddress);
      oracle.commit(poolAddress);
    });

    it("reverts when pool has already been initialized", async function () {
      await oracle.initPool(poolAddress);
      await expect(oracle.initPool(poolAddress)).to.be.revertedWith(
        "Pool initialized"
      );
    });
  });

  describe("commit", () => {
    time.revertToSnapshotAfterEach();

    it("commits the twap", async function () {
      await oracle.initPool(poolAddress);
      const topOfPeriod = await getTopOfPeriod();
      await time.increaseTo(topOfPeriod);
      await oracle.commit(poolAddress);

      const {
        lastTimestamp: timestamp1,
        mean: mean1,
        dsq: dsq1,
      } = await oracle.accumulators(poolAddress);
      assert.equal(timestamp1, topOfPeriod);
      assert.equal(mean1.toNumber(), 0);
      assert.equal(dsq1.toNumber(), 0);

      let stdev = await oracle.vol(poolAddress);
      assert.equal(stdev.toNumber(), 0);
    });

    it("reverts when out of commit phase", async function () {
      await oracle.initPool(poolAddress);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;

      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION - 10);
      await expect(oracle.commit(poolAddress)).to.be.revertedWith(
        "Not commit phase"
      );

      await time.increaseTo(topOfPeriod + COMMIT_PHASE_DURATION + 10);
      await expect(oracle.commit(poolAddress)).to.be.revertedWith(
        "Not commit phase"
      );
    });

    it("reverts when there is an existing commit for period", async function () {
      await oracle.initPool(poolAddress);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      await oracle.commit(poolAddress);

      // Cannot commit immediately after
      await expect(oracle.commit(poolAddress)).to.be.revertedWith("Committed");

      // Cannot commit before commit phase begins
      const beforePeriod = topOfPeriod + 100;
      await time.increaseTo(beforePeriod);
      await expect(oracle.commit(poolAddress)).to.be.revertedWith("Committed");

      const nextPeriod = topOfPeriod + PERIOD - COMMIT_PHASE_DURATION;
      await time.increaseTo(nextPeriod);
      await oracle.commit(poolAddress);
    });

    it("reverts when pool has not been initialized", async function () {
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);

      // Cannot commit immediately after
      await expect(oracle.commit(poolAddress)).to.be.revertedWith(
        "!pool initialize"
      );
    });

    it("commits when within commit phase", async function () {
      await oracle.initPool(poolAddress);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod - COMMIT_PHASE_DURATION);
      await oracle.commit(poolAddress);

      const nextTopOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(nextTopOfPeriod + COMMIT_PHASE_DURATION);
      await oracle.commit(poolAddress);
    });

    it("fits gas budget", async function () {
      await oracle.initPool(poolAddress);
      const latestTimestamp = (await provider.getBlock("latest")).timestamp;
      const topOfPeriod = latestTimestamp - (latestTimestamp % PERIOD);

      // First time is more expensive
      const tx1 = await oracle.commit(poolAddress);
      const receipt1 = await tx1.wait();
      assert.isAtMost(receipt1.gasUsed.toNumber(), 156538);

      await time.increaseTo(topOfPeriod + PERIOD);

      // Second time is cheaper
      const tx2 = await oracle.commit(poolAddress);
      const receipt2 = await tx2.wait();
      assert.isAtMost(receipt2.gasUsed.toNumber(), 72136);
    });
  });
}

function behavesLikeMockOracle() {
  let mockOracle: Contract;
  let signer: SignerWithAddress;
  const poolAddress = ETH_USDC_POOL;

  before(async function () {
    [signer] = await ethers.getSigners();
    const TestVolOracle = await getContractFactory("TestVolOracle", signer);
    mockOracle = await TestVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);
  });

  describe("MockOracle", () => {
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

      await mockOracle.initPool(poolAddress);

      for (let i = 0; i < values.length; i++) {
        await mockOracle.setPrice(values[i]);
        const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
        await time.increaseTo(topOfPeriod);
        await mockOracle.mockCommit(poolAddress);
        let stdev = await mockOracle.vol(poolAddress);
        assert.equal(stdev.toString(), stdevs[i].toString());
      }
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

        await mockOracle.initPool(poolAddress);

        for (let i = 0; i < values.length; i++) {
          await mockOracle.setPrice(values[i]);
          const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
          await time.increaseTo(topOfPeriod);
          await mockOracle.mockCommit(poolAddress);
        }
        assert.equal((await mockOracle.vol(poolAddress)).toString(), "6607827"); // 6.6%
        assert.equal(
          (await mockOracle.annualizedVol(poolAddress)).toString(),
          "178411329"
        ); // 178% annually
      });
    });
  });
}

async function getTopOfPeriod() {
  const latestTimestamp = (await provider.getBlock("latest")).timestamp;
  let topOfPeriod: number;

  const rem = latestTimestamp % PERIOD;
  if (rem < Math.floor(PERIOD / 2)) {
    topOfPeriod = latestTimestamp - rem + PERIOD;
  } else {
    topOfPeriod = latestTimestamp + rem + PERIOD;
  }
  return topOfPeriod;
}
