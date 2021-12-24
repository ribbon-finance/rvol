import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { Contract } from "ethers";
import moment from "moment-timezone";
import * as time from "../helpers/time";
import * as math from "../helpers/math";
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { provider, getContractFactory } = ethers;

moment.tz.setDefault("UTC");

describe("OptionsPremiumPricerInETH", () => {
  let mockOracle: Contract;
  let optionsPremiumPricer: Contract;
  let testOptionsPremiumPricer: Contract;
  let signer: SignerWithAddress;
  let underlyingPrice: BigNumber;
  let underlyingPriceShifted: BigNumber;

  const PERIOD = 43200; // 12 hours
  const WINDOW_IN_DAYS = 7; // weekly vol data
  const WEEK = 604800; // 7 days

  const bzrxethPool = "0x4f25F309FbE94771e4F636D5D433A8f8Cd5C332B";

  const bzrxPriceOracleAddress = "0x8f7c7181ed1a2ba41cfc3f5d064ef91b67daef66";
  const wethPriceOracleAddress = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const usdcPriceOracleAddress = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

  const pool = bzrxethPool;

  before(async function () {
    [signer] = await ethers.getSigners();
    const TestVolOracle = await getContractFactory("TestVolOracle", signer);
    const OptionsPremiumPricer = await getContractFactory(
      "OptionsPremiumPricerInETH",
      signer
    );
    const TestOptionsPremiumPricer = await getContractFactory(
      "TestOptionsPremiumPricerInETH",
      signer
    );

    mockOracle = await TestVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);

    optionsPremiumPricer = await OptionsPremiumPricer.deploy(
      bzrxethPool,
      mockOracle.address,
      bzrxPriceOracleAddress,
      usdcPriceOracleAddress,
      wethPriceOracleAddress
    );
    testOptionsPremiumPricer = await TestOptionsPremiumPricer.deploy(
      bzrxethPool,
      mockOracle.address,
      bzrxPriceOracleAddress,
      usdcPriceOracleAddress,
      wethPriceOracleAddress
    );

    let oracleDecimals = 8;
    underlyingPrice = await optionsPremiumPricer.getUnderlyingPrice();
    underlyingPriceShifted = (
      await optionsPremiumPricer.getUnderlyingPrice()
    ).mul(BigNumber.from(10).pow(18 - oracleDecimals));
  });

  describe("#getPremium", () => {
    time.revertToSnapshotAfterEach();

    beforeEach(async () => {
      await updateVol(pool);
    });

    it("reverts on timestamp being in the past", async function () {
      const expiryTimestamp = (await time.now()).sub(WEEK);
      await expect(
        optionsPremiumPricer.getPremium(10, expiryTimestamp, true)
      ).to.be.revertedWith("Expiry must be in the future!");
    });

    it("gets the correct premium", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);
      const underlyingStrikeDiff = strikePrice.sub(underlyingPrice);
      const expiryTimestamp = (await time.now()).add(WEEK);
      const isPut = false;

      const premium = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestamp,
        isPut
      );

      console.log(
        `\tpremium is ${math.wmul(premium, underlyingPriceShifted).toString()}`
      );

      assert.equal(
        math.wmul(premium, underlyingPriceShifted).toString(),
        "1287280691200000"
      );

      assert.isAbove(
        parseInt(math.wmul(premium, underlyingPriceShifted).toString()),
        parseInt(underlyingStrikeDiff.toString())
      );
    });

    it("gives more expensive put than call if strikePrice above current price", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);
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

      console.log(
        `\tpremiumCall is ${math
          .wmul(premiumCall, underlyingPriceShifted)
          .toString()}`
      );
      console.log(`\tpremiumPut is ${premiumPut}`);

      assert.equal(premiumPut.toString(), "31495280000000000");
      assert.equal(
        math.wmul(premiumCall, underlyingPriceShifted).toString(),
        "1287280691200000"
      );

      assert.isAbove(
        parseInt(premiumPut.toString()),
        parseInt(math.wmul(premiumCall, underlyingPriceShifted).toString())
      );
    });

    it("gives more expensive call than put if strikePrice below current price", async function () {
      const strikePrice = underlyingPrice.mul(90000).div(100000);
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

      console.log(
        `\tpremiumCall is ${math
          .wmul(premiumCall, underlyingPriceShifted)
          .toString()}`
      );
      console.log(`\tpremiumPut is ${premiumPut}`);

      assert.equal(premiumPut.toString(), "883660000000000");
      assert.equal(
        math.wmul(premiumCall, underlyingPriceShifted).toString(),
        "31091659520000000"
      );

      assert.isAbove(
        parseInt(math.wmul(premiumCall, underlyingPriceShifted).toString()),
        parseInt(premiumPut.toString())
      );
    });

    it("gives smaller premium price for option with extremely OTM strike price", async function () {
      const strikePriceSmall = underlyingPrice.mul(110000).div(100000);
      const strikePriceBig = underlyingPrice.mul(120000).div(100000);
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

      console.log(
        `\tpremiumSmall is ${math
          .wmul(premiumSmall, underlyingPriceShifted)
          .toString()}`
      );
      console.log(
        `\tpremiumBig is ${math
          .wmul(premiumBig, underlyingPriceShifted)
          .toString()}`
      );

      assert.equal(
        math.wmul(premiumSmall, underlyingPriceShifted).toString(),
        "1287280691200000"
      );
      assert.equal(
        math.wmul(premiumBig, underlyingPriceShifted).toString(),
        "79320166400000"
      );

      assert.isAbove(
        parseInt(math.wmul(premiumSmall, underlyingPriceShifted).toString()),
        parseInt(math.wmul(premiumBig, underlyingPriceShifted).toString())
      );
    });

    it("gives same premium price for puts/calls for ATM", async function () {
      const strikePrice = underlyingPrice;
      const expiryTimestamp = (await time.now()).add(WEEK);
      const isPut = false;

      const premiumCall = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestamp,
        isPut
      );

      const premiumPut = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestamp,
        !isPut
      );

      console.log(
        `\tpremiumCall is ${math.wmul(premiumCall, underlyingPriceShifted)}`
      );
      console.log(`\tpremiumPut is ${premiumPut}`);

      assert.equal(
        math.wmul(premiumCall, underlyingPriceShifted).toString(),
        "9322370048000000"
      );
      assert.equal(premiumPut.toString(), "9322370000000000");

      assert.equal(
        parseInt(premiumPut.div(10 ** 10).toString()),
        parseInt(math.wmul(premiumCall, underlyingPriceShifted).div(10 ** 10).toString())
      );
    });

    it("gives more expensive price for expiry twice as far out from now", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);
      const expiryTimestampSmall = (await time.now()).add(WEEK);
      const expiryTimestampBig = (await time.now()).add(2 * WEEK);
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

      console.log(
        `\tpremiumSmallTimestamp is ${math.wmul(
          premiumSmallTimestamp,
          underlyingPriceShifted
        )}`
      );
      console.log(
        `\tpremiumBigTimestamp is ${math.wmul(
          premiumBigTimestamp,
          underlyingPriceShifted
        )}`
      );

      assert.equal(
        math
          .wmul(premiumSmallTimestamp, underlyingPriceShifted)
          .toString(),
        "1287280691200000"
      );
      assert.equal(
        math
          .wmul(premiumBigTimestamp, underlyingPriceShifted)
          .toString(),
        "3667199846400000"
      );

      assert.isBelow(
        parseInt(
          math.wmul(premiumSmallTimestamp, underlyingPriceShifted).toString()
        ),
        parseInt(
          math.wmul(premiumBigTimestamp, underlyingPriceShifted).toString()
        )
      );
    });

    it("fits the gas budget", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const { gas: callGas } = await testOptionsPremiumPricer.testGetPremium(
        strikePrice,
        expiryTimestamp,
        false
      );
      const { gas: putGas } = await testOptionsPremiumPricer.testGetPremium(
        strikePrice,
        expiryTimestamp,
        true
      );

      assert.isAtMost(callGas.toNumber(), 75290);
      assert.isAtMost(putGas.toNumber(), 92575);
      // console.log("\t"+"getPremium call:", callGas.toNumber());
      // console.log("\t"+"getPremium put:", putGas.toNumber());
    });
  });

  describe("#getPremiumInStables", () => {
    time.revertToSnapshotAfterEach();

    beforeEach(async () => {
      await updateVol(pool);
    });

    it("reverts on timestamp being in the past", async function () {
      const expiryTimestamp = (await time.now()).sub(WEEK);
      await expect(
        optionsPremiumPricer.getPremiumInStables(0, expiryTimestamp, true)
      ).to.be.revertedWith("Expiry must be in the future!");
    });

    it("gets the correct premium", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);
      const underlyingStrikeDiff = strikePrice.sub(underlyingPrice);
      const expiryTimestamp = (await time.now()).add(WEEK);
      const isPut = false;

      const premium = await optionsPremiumPricer.getPremium(
        strikePrice,
        expiryTimestamp,
        isPut
      );

      const premiumInStables = await optionsPremiumPricer.getPremiumInStables(
        strikePrice,
        expiryTimestamp,
        isPut
      );

      assert.equal(
        parseInt(premiumInStables.div(10 ** 10).toString()),
        parseInt(math.wmul(premium, underlyingPriceShifted).div(10 ** 10).toString())
      );

      console.log(
        `\tpremium is ${math.wmul(premium, underlyingPriceShifted).toString()}`
      );

      assert.equal(
        math.wmul(premium, underlyingPriceShifted).toString(),
        "1287280691200000"
      );

      assert.isAbove(
        parseInt(math.wmul(premium, underlyingPriceShifted).toString()),
        parseInt(underlyingStrikeDiff.toString())
      );
    });

    it("gives more expensive put than call if strikePrice above current price", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const premiumCall = await optionsPremiumPricer.getPremiumInStables(
        strikePrice,
        expiryTimestamp,
        false
      );
      const premiumPut = await optionsPremiumPricer.getPremiumInStables(
        strikePrice,
        expiryTimestamp,
        true
      );

      console.log(`\tpremiumCall is ${premiumCall}`);
      console.log(`\tpremiumPut is ${premiumPut}`);

      assert.equal(premiumPut.toString(), "31495280000000000");
      assert.equal(premiumCall.toString(), "1287280000000000");

      assert.isAbove(
        parseInt(premiumPut.toString()),
        parseInt(premiumCall.toString())
      );
    });

    it("gives more expensive call than put if strikePrice below current price", async function () {
      const strikePrice = underlyingPrice.mul(90000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const premiumCall = await optionsPremiumPricer.getPremiumInStables(
        strikePrice,
        expiryTimestamp,
        false
      );
      const premiumPut = await optionsPremiumPricer.getPremiumInStables(
        strikePrice,
        expiryTimestamp,
        true
      );

      console.log(`\tpremiumCall is ${premiumCall}`);
      console.log(`\tpremiumPut is ${premiumPut}`);

      assert.equal(premiumPut.toString(), "883660000000000");
      assert.equal(premiumCall.toString(), "31091660000000000");

      assert.isAbove(
        parseInt(premiumCall.toString()),
        parseInt(premiumPut.toString())
      );
    });

    it("gives smaller premium price for option with extremely OTM strike price", async function () {
      const strikePriceSmall = underlyingPrice.mul(110000).div(100000);
      const strikePriceBig = underlyingPrice.mul(120000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);
      const isPut = false;

      const premiumSmall = await optionsPremiumPricer.getPremiumInStables(
        strikePriceSmall,
        expiryTimestamp,
        isPut
      );
      const premiumBig = await optionsPremiumPricer.getPremiumInStables(
        strikePriceBig,
        expiryTimestamp,
        isPut
      );

      console.log(`\tpremiumSmall is ${premiumSmall}`);
      console.log(`\tpremiumBig is ${premiumBig}`);

      assert.equal(premiumSmall.toString(), "1287280000000000");
      assert.equal(premiumBig.toString(), "79320000000000");

      assert.isAbove(
        parseInt(premiumSmall.toString()),
        parseInt(premiumBig.toString())
      );
    });

    it("gives same premium price for puts/calls for ATM", async function () {
      const strikePrice = underlyingPrice;
      const expiryTimestamp = (await time.now()).add(WEEK);
      const isPut = false;

      const premiumCall = await optionsPremiumPricer.getPremiumInStables(
        strikePrice,
        expiryTimestamp,
        isPut
      );

      const premiumPut = await optionsPremiumPricer.getPremiumInStables(
        strikePrice,
        expiryTimestamp,
        !isPut
      );

      console.log(`\tpremiumCall is ${premiumPut}`);
      console.log(`\tpremiumPut is ${premiumPut}`);

      assert.equal(premiumPut.toString(), "9322370000000000");
      assert.equal(premiumPut.toString(), "9322370000000000");

      assert.equal(
        parseInt(premiumPut.toString()),
        parseInt(premiumCall)
      );
    });

    it("gives more expensive price for expiry twice as far out from now", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);
      const expiryTimestampSmall = (await time.now()).add(WEEK);
      const expiryTimestampBig = (await time.now()).add(2 * WEEK);
      const isPut = false;

      const premiumSmallTimestamp = await optionsPremiumPricer.getPremiumInStables(
        strikePrice,
        expiryTimestampSmall,
        isPut
      );
      const premiumBigTimestamp = await optionsPremiumPricer.getPremiumInStables(
        strikePrice,
        expiryTimestampBig,
        isPut
      );

      console.log(
        `\tpremiumSmallTimestamp is ${premiumSmallTimestamp}`
      );
      console.log(
        `\tpremiumBigTimestamp is ${premiumBigTimestamp}`
      );

      assert.equal(premiumSmallTimestamp, "1287280000000000");
      assert.equal(premiumBigTimestamp, "3667200000000000");

      assert.isBelow(
        parseInt(
          premiumSmallTimestamp.toString()
        ),
        parseInt(
          premiumBigTimestamp.toString()
        )
      );
    });

    it("fits the gas budget", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const { gas: callGas } = await testOptionsPremiumPricer.testGetPremiumInStables(
        strikePrice,
        expiryTimestamp,
        false
      );
      const { gas: putGas } = await testOptionsPremiumPricer.testGetPremiumInStables(
        strikePrice,
        expiryTimestamp,
        true
      );

      assert.isAtMost(callGas.toNumber(), 92540);
      assert.isAtMost(putGas.toNumber(), 92529);
      // console.log("\t"+"getPremium call:", callGas.toNumber());
      // console.log("\t"+"getPremium put:", putGas.toNumber());
    });
  });

  describe("#getOptionDelta", () => {
    time.revertToSnapshotAfterEach();

    beforeEach(async () => {
      await updateVol(pool);
    });

    it("reverts on timestamp being in the past", async function () {
      await expect(
        optionsPremiumPricer["getOptionDelta(uint256,uint256)"](
          0,
          BigNumber.from(await provider.getBlockNumber()).sub(100)
        )
      ).to.be.revertedWith("Expiry must be in the future!");
    });

    it("gets the correct option delta for strike > underlying", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);

      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "1164");
      assert.isBelow(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike < underlying", async function () {
      const strikePrice = underlyingPrice.mul(90000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "9193");
      assert.isAbove(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike = underlying", async function () {
      const strikePrice = underlyingPrice;
      const strikePriceLarger = underlyingPrice.mul(90000).div(100000);

      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      const deltaLarger = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePriceLarger, expiryTimestamp);

      console.log(`\tdeltaSmall is ${delta.toString()}`);
      console.log(`\tdeltaLarger is ${deltaLarger.toString()}`);

      assert.equal(delta.toString(), "5154");

      assert.isAbove(parseInt(delta.toString()), 5000);
      assert.isBelow(
        parseInt(delta.toString()),
        parseInt(deltaLarger.toString())
      );
    });

    it("fits the gas budget", async function () {
      const strikePriceLarger = underlyingPrice.mul(90000).div(100000);

      const expiryTimestamp = (await time.now()).add(WEEK);

      const { gas } = await testOptionsPremiumPricer[
        "testGetOptionDelta(uint256,uint256)"
      ](strikePriceLarger, expiryTimestamp);

      assert.isAtMost(gas.toNumber(), 49000);
      // console.log("\t"+"getOptionDelta:", gas.toNumber());
    });
  });

  describe("#getOptionDelta (overloaded)", () => {
    time.revertToSnapshotAfterEach();
    let annualizedVol: BigNumber;

    beforeEach(async () => {
      await updateVol(pool);
      let optionsPremiumPricerPool = await optionsPremiumPricer.pool();
      annualizedVol = (
        await mockOracle.annualizedVol(optionsPremiumPricerPool)
      ).mul(BigNumber.from(10).pow(10));
    });

    it("reverts on timestamp being in the past", async function () {
      await expect(
        optionsPremiumPricer["getOptionDelta(uint256,uint256,uint256,uint256)"](
          0,
          0,
          0,
          BigNumber.from(await provider.getBlockNumber()).sub(100)
        )
      ).to.be.revertedWith("Expiry must be in the future!");
    });

    it("gets the correct option delta for strike > underlying", async function () {
      const strikePrice = underlyingPrice.mul(110000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "1164");
      assert.isBelow(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike < underlying", async function () {
      const strikePrice = underlyingPrice.mul(90000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "9193");
      assert.isAbove(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike = underlying", async function () {
      const strikePrice = underlyingPrice;
      const strikePriceLarger = underlyingPrice.mul(90000).div(100000);

      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      const deltaLarger = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePriceLarger, annualizedVol, expiryTimestamp);

      console.log(`\tdeltaSmall is ${delta.toString()}`);
      console.log(`\tdeltaLarger is ${deltaLarger.toString()}`);

      assert.equal(delta.toString(), "5154");

      assert.isAbove(parseInt(delta.toString()), 5000);
      assert.isBelow(
        parseInt(delta.toString()),
        parseInt(deltaLarger.toString())
      );
    });

    it("fits the gas budget", async function () {
      const strikePriceLarger = underlyingPrice.mul(90000).div(100000);

      const expiryTimestamp = (await time.now()).add(WEEK);

      const { gas } = await testOptionsPremiumPricer[
        "testGetOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePriceLarger, annualizedVol, expiryTimestamp);

      assert.isAtMost(gas.toNumber(), 49000);
      // console.log("\t"+"getOptionDelta:", gas.toNumber());
    });
  });

  describe("derivatives", () => {
    it("reverts when one of the inputs are 0", async function () {
      await expect(
        testOptionsPremiumPricer.testDerivatives(
          0,
          BigNumber.from("1652735610000000000"),
          BigNumber.from("241664000000"),
          BigNumber.from("211664000000")
        )
      ).to.be.revertedWith("!sSQRT");

      await expect(
        testOptionsPremiumPricer.testDerivatives(
          7,
          BigNumber.from("0"),
          BigNumber.from("241664000000"),
          BigNumber.from("211664000000")
        )
      ).to.be.revertedWith("!sSQRT");

      await expect(
        testOptionsPremiumPricer.testDerivatives(
          7,
          BigNumber.from("1652735610000000000"),
          BigNumber.from("0"),
          BigNumber.from("211664000000")
        )
      ).to.be.revertedWith("!sp");

      await expect(
        testOptionsPremiumPricer.testDerivatives(
          7,
          BigNumber.from("241664000000"),
          BigNumber.from("241664000000"),
          BigNumber.from("0")
        )
      ).to.be.revertedWith("!st");
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

  const updateVol = async (pool: string) => {
    const values = [
      BigNumber.from("90000000000000"),
      BigNumber.from("95000000000000"),
      BigNumber.from("105000000000000"),
      BigNumber.from("110000000000000"),
      BigNumber.from("115000000000000"),
      BigNumber.from("120000000000000"),
      BigNumber.from("125000000000000"),
      BigNumber.from("130000000000000"),
      BigNumber.from("135000000000000"),
      BigNumber.from("140000000000000"),
      BigNumber.from("145000000000000"),
      BigNumber.from("150000000000000"),
      BigNumber.from("155000000000000"),
    ];

    await mockOracle.initPool(pool);

    for (let i = 0; i < values.length; i++) {
      await mockOracle.setPrice(values[i]);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);
      await mockOracle.mockCommit(pool);
    }
  };
});

