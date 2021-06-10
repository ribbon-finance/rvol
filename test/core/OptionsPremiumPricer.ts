import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { Contract } from "@ethersproject/contracts";
import moment from "moment-timezone";
import * as time from "../helpers/time";
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { provider, getContractFactory } = ethers;

moment.tz.setDefault("UTC");

describe("OptionsPremiumPricer", () => {
  let mockOracle: Contract;
  let optionsPremiumPricer: Contract;
  let wethPriceOracle: Contract;
  let signer: SignerWithAddress;

  const PERIOD = 43200; // 12 hours
  const COMMIT_PHASE_DURATION = 1800; // 30 mins
  const WEEK = 604800; // 7 days

  const ethusdcPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
  const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  const wethPriceOracleAddress = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const wethCTokenAddress = "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";
  const blackScholesCalculatorAddress =
    "0xCCdfCB72753CfD55C5afF5d98eA5f9C43be9659d";

  before(async function () {
    [signer] = await ethers.getSigners();
    const TestVolOracle = await getContractFactory("TestVolOracle", signer);
    const OptionsPremiumPricer = await getContractFactory(
      "OptionsPremiumPricer",
      signer
    );

    mockOracle = await TestVolOracle.deploy(ethusdcPool, weth, usdc, PERIOD);
    optionsPremiumPricer = await OptionsPremiumPricer.deploy(
      mockOracle.address,
      wethPriceOracleAddress,
      wethCTokenAddress,
      blackScholesCalculatorAddress
    );
    wethPriceOracle = await ethers.getContractAt(
      "IPriceOracle",
      await optionsPremiumPricer.priceOracle()
    );
  });

  describe.skip("getAssetRiskFreeRate", () => {
    time.revertToSnapshotAfterEach();

    it("gets reasonable APY (~0%-0.75%)", async function () {
      const apy = await optionsPremiumPricer.getAssetRiskFreeRate();
      console.log(apy);
    });
  });

  describe("getUnderlyingPrice", () => {
    time.revertToSnapshotAfterEach();

    it("gets the correct underlying price for asset", async function () {
      assert.deepEqual(
        await optionsPremiumPricer.getUnderlyingPrice(),
        (await wethPriceOracle.latestAnswer()).div(
          BigNumber.from(10).pow(await wethPriceOracle.decimals())
        )
      );
    });
  });

  describe("getPremium", () => {
    time.revertToSnapshotAfterEach();

    beforeEach(async () => {
      await updateVol();
    });

    it("reverts on timestamp being in the past", async function () {
      const expiryTimestamp = (await time.now()).sub(WEEK);
      await expect(
        optionsPremiumPricer.getPremium(0, expiryTimestamp, true)
      ).to.be.revertedWith("Expiry must be in the future!");
    });

    it("gets the correct premium", async function () {
      const strikePrice = BigNumber.from(
        await optionsPremiumPricer.getUnderlyingPrice()
      ).add(200);
      const expiryTimestamp = (await time.now()).add(WEEK);
      const isPut = false;

      const premium = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestamp,
        isPut
      );

      console.log(`Premium is ${premium}`);
      assert.isAbove(parseInt(premium.toString()), 0);
    });

    it("gives more expensive put than call if strikePrice above current price", async function () {
      const strikePrice = BigNumber.from(
        await optionsPremiumPricer.getUnderlyingPrice()
      ).add(200);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const premiumCall = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestamp,
        false
      );
      const premiumPut = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestamp,
        true
      );

      assert.isAbove(
        parseInt(premiumPut.toString()),
        parseInt(premiumCall.toString())
      );
    });

    it("gives more expensive call than put if strikePrice below current price", async function () {
      const strikePrice = BigNumber.from(
        await optionsPremiumPricer.getUnderlyingPrice()
      ).sub(200);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const premiumCall = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestamp,
        false
      );
      const premiumPut = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestamp,
        true
      );

      assert.isAbove(
        parseInt(premiumCall.toString()),
        parseInt(premiumPut.toString())
      );
    });

    it("gives smaller premium price for option with extremely OTM strike price", async function () {
      const strikePriceSmall = BigNumber.from(
        await optionsPremiumPricer.getUnderlyingPrice()
      ).add(200);
      const strikePriceBig = BigNumber.from(
        await optionsPremiumPricer.getUnderlyingPrice()
      ).add(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);
      const isPut = false;

      const premiumSmall = await optionsPremiumPricer.getPremium(
        strikePriceSmall,
        expiryTimestamp,
        isPut
      );
      const premiumBig = await optionsPremiumPricer.getPremium(
        strikePriceBig,
        expiryTimestamp,
        isPut
      );

      assert.isAbove(
        parseInt(premiumSmall.toString()),
        parseInt(premiumBig.toString())
      );
    });

    it("gives more expensive price for expiry twice as far out from now", async function () {
      const strikePrice = BigNumber.from(
        await optionsPremiumPricer.getUnderlyingPrice()
      ).add(200);
      const expiryTimestampSmall = (await time.now()).add(WEEK);
      const expiryTimestampBig = (await time.now()).add(10 * WEEK);
      const isPut = false;

      const premiumSmallTimestamp = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestampSmall,
        isPut
      );
      const premiumBigTimestamp = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestampBig,
        isPut
      );

      console.log(premiumBigTimestamp.toString());
      console.log(premiumSmallTimestamp.toString());
      assert.isAbove(
        parseInt(premiumBigTimestamp.toString()),
        parseInt(premiumSmallTimestamp.toString())
      );
    });
  });

  describe("getOptionDelta", () => {
    time.revertToSnapshotAfterEach();

    beforeEach(async () => {
      await updateVol();
    });

    it("reverts on timestamp being in the past", async function () {
      await expect(
        optionsPremiumPricer.getOptionDelta(
          0,
          BigNumber.from(await provider.getBlockNumber()).sub(100)
        )
      ).to.be.revertedWith("Expiry must be in the future!");
    });

    it("gets the correct option delta", async function () {
      const strikePrice = BigNumber.from(
        await optionsPremiumPricer.getUnderlyingPrice()
      ).add(1000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer.getOptionDelta(
        strikePrice,
        expiryTimestamp
      );

      console.log(delta.toString());
      assert.isAbove(parseInt(delta), 0);
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

  const updateVol = async () => {
    const values = [
      BigNumber.from("2000000000"),
      BigNumber.from("2100000000"),
      BigNumber.from("2200000000"),
      BigNumber.from("2150000000"),
    ];

    for (let i = 0; i < values.length; i++) {
      await mockOracle.setPrice(values[i]);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);
      await mockOracle.mockCommit();
    }
  };
});
