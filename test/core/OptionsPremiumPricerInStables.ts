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

describe("OptionsPremiumPricerInStables", () => {
  let mockOracle: Contract;
  let optionsPremiumPricer: Contract;
  let testOptionsPremiumPricer: Contract;
  let wethPriceOracle: Contract;
  let signer: SignerWithAddress;
  let underlyingPrice: BigNumber;
  let underlyingPriceShifted: BigNumber;
  let optionId: String;

  const WEEK = 604800; // 7 days
  const WAD = BigNumber.from(10).pow(18);

  const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const delta = 1000;

  const wethPriceOracleAddress = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const usdcPriceOracleAddress = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

  before(async function () {
    [signer] = await ethers.getSigners();
    const TestVolOracle = await getContractFactory("ManualVolOracle", signer);
    const OptionsPremiumPricer = await getContractFactory(
      "OptionsPremiumPricerInStables",
      signer
    );
    const TestOptionsPremiumPricer = await getContractFactory(
      "TestOptionsPremiumPricerInStables",
      signer
    );

    mockOracle = await TestVolOracle.deploy(signer.address);

    optionId = await mockOracle.getOptionId(
      delta,
      weth,
      weth,
      false
    );

    await mockOracle.setAnnualizedVol([optionId], [165273561]);

    optionsPremiumPricer = await OptionsPremiumPricer.deploy(
      optionId,
      mockOracle.address,
      wethPriceOracleAddress,
      usdcPriceOracleAddress
    );
    testOptionsPremiumPricer = await TestOptionsPremiumPricer.deploy(
      optionId,
      mockOracle.address,
      wethPriceOracleAddress,
      usdcPriceOracleAddress
    );

    wethPriceOracle = await ethers.getContractAt(
      "IPriceOracle",
      await optionsPremiumPricer.priceOracle()
    );

    underlyingPrice = await optionsPremiumPricer.getUnderlyingPrice();
    underlyingPriceShifted = (
      await optionsPremiumPricer.getUnderlyingPrice()
    ).mul(BigNumber.from(10).pow(10));
  });

  describe("getUnderlyingPrice", () => {
    time.revertToSnapshotAfterEach();

    it("gets the correct underlying price for asset", async function () {
      assert.deepEqual(
        await optionsPremiumPricer.getUnderlyingPrice(),
        await wethPriceOracle.latestAnswer()
      );
    });
  });

  describe("getPremium", () => {
    time.revertToSnapshotAfterEach();

    it("reverts on timestamp being in the past", async function () {
      const expiryTimestamp = (await time.now()).sub(WEEK);
      await expect(
        optionsPremiumPricer.getPremium(0, expiryTimestamp, true)
      ).to.be.revertedWith("Expiry must be in the future!");
    });

    it("gets the correct premium", async function () {
      const underlyingStrikeDiff = 200;
      const strikePrice = underlyingPrice.add(
        BigNumber.from(underlyingStrikeDiff).mul(BigNumber.from(10).pow(8))
      );
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
        math.wmul(premium, underlyingPriceShifted).div(WAD).toString(),
        "142"
      );

      assert.isAbove(
        parseInt(math.wmul(premium, underlyingPriceShifted).toString()),
        parseInt(
          BigNumber.from(underlyingStrikeDiff)
            .mul(BigNumber.from(10).pow(8))
            .toString()
        )
      );
    });

    it("gives more expensive put than call if strikePrice above current price", async function () {
      const strikePrice = underlyingPrice.add(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );
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

      assert.equal(premiumPut.div(WAD).toString(), "413");
      assert.equal(
        math.wmul(premiumCall, underlyingPriceShifted).div(WAD).toString(),
        "113"
      );

      assert.isAbove(
        parseInt(premiumPut.toString()),
        parseInt(math.wmul(premiumCall, underlyingPriceShifted).toString())
      );
    });

    it("gives more expensive call than put if strikePrice below current price", async function () {
      const strikePrice = underlyingPrice.sub(
        BigNumber.from(200).mul(BigNumber.from(10).pow(8))
      );
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

      assert.equal(premiumPut.div(WAD).toString(), "125");
      assert.equal(
        math.wmul(premiumCall, underlyingPriceShifted).div(WAD).toString(),
        "325"
      );

      assert.isAbove(
        parseInt(math.wmul(premiumCall, underlyingPriceShifted).toString()),
        parseInt(premiumPut.toString())
      );
    });

    it("gives smaller premium price for option with extremely OTM strike price", async function () {
      const strikePriceSmall = underlyingPrice.add(
        BigNumber.from(200).mul(BigNumber.from(10).pow(8))
      );
      const strikePriceBig = BigNumber.from(
        await optionsPremiumPricer.getUnderlyingPrice()
      ).add(BigNumber.from(1000).mul(BigNumber.from(10).pow(8)));
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
        math.wmul(premiumSmall, underlyingPriceShifted).div(WAD).toString(),
        "142"
      );
      assert.equal(
        math.wmul(premiumBig, underlyingPriceShifted).div(WAD).toString(),
        "18"
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
        math.wmul(premiumCall, underlyingPriceShifted).div(WAD).toString(),
        "220"
      );
      assert.equal(premiumPut.div(WAD).toString(), "220");

      // Broke it up into range because with calls we go from usd -> eth -> usd,
      // whereas with puts we go usd -> usdc which is not 100% equal so it ends up being a bit less
      assert.isAbove(
        parseInt(math.wmul(premiumCall, underlyingPriceShifted).toString()),
        (parseInt(premiumPut.toString()) * 99) / 100
      );

      assert.isBelow(
        parseInt(premiumPut.toString()),
        parseInt(math.wmul(premiumCall, underlyingPriceShifted).toString())
      );
    });

    it("gives more expensive price for expiry twice as far out from now", async function () {
      const strikePrice = underlyingPrice.add(
        BigNumber.from(200).mul(BigNumber.from(10).pow(8))
      );
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
          .div(WAD)
          .toString(),
        "142"
      );
      assert.equal(
        math
          .wmul(premiumBigTimestamp, underlyingPriceShifted)
          .div(WAD)
          .toString(),
        "233"
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
      const strikePrice = underlyingPrice.add(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );
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

      assert.isAtMost(callGas.toNumber(), 56719);
      assert.isAtMost(putGas.toNumber(), 74168);
      // console.log("\t"+"getPremium call:", callGas.toNumber());
      // console.log("\t"+"getPremium put:", putGas.toNumber());
    });
  });

  describe("getOptionDelta", () => {
    time.revertToSnapshotAfterEach();


    it("reverts on timestamp being in the past", async function () {
      await expect(
        optionsPremiumPricer["getOptionDelta(uint256,uint256)"](
          0,
          BigNumber.from(await provider.getBlockNumber()).sub(100)
        )
      ).to.be.revertedWith("Expiry must be in the future!");
    });

    it("gets the correct option delta for strike > underlying", async function () {
      const strikePrice = underlyingPrice.add(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "3457");
      assert.isBelow(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike < underlying", async function () {
      const strikePrice = underlyingPrice.sub(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "7560");
      assert.isAbove(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike = underlying", async function () {
      const strikePrice = underlyingPrice;
      const strikePriceLarger = underlyingPrice.sub(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );

      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      const deltaLarger = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePriceLarger, expiryTimestamp);

      console.log(`\tdeltaSmall is ${delta.toString()}`);
      console.log(`\tdeltaLarger is ${deltaLarger.toString()}`);

      assert.equal(delta.toString(), "5455");

      assert.isAbove(parseInt(delta.toString()), 5000);
      assert.isBelow(
        parseInt(delta.toString()),
        parseInt(deltaLarger.toString())
      );
    });

    it("fits the gas budget", async function () {
      const strikePriceLarger = underlyingPrice.sub(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );

      const expiryTimestamp = (await time.now()).add(WEEK);

      const { gas } = await testOptionsPremiumPricer[
        "testGetOptionDelta(uint256,uint256)"
      ](strikePriceLarger, expiryTimestamp);

      assert.isAtMost(gas.toNumber(), 49000);
      // console.log("\t"+"getOptionDelta:", gas.toNumber());
    });
  });

  describe("getOptionDelta (overloaded)", () => {
    time.revertToSnapshotAfterEach();
    let annualizedVol: BigNumber;

    beforeEach(async () => {
      annualizedVol = (
        await mockOracle["annualizedVol(uint256,address,address,bool)"](
          delta,
          weth,
          weth,
          false
        )
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
      const strikePrice = underlyingPrice.add(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "3457");
      assert.isBelow(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike < underlying", async function () {
      const strikePrice = underlyingPrice.sub(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "7560");
      assert.isAbove(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike = underlying", async function () {
      const strikePrice = underlyingPrice;
      const strikePriceLarger = underlyingPrice.sub(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );

      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      const deltaLarger = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePriceLarger, annualizedVol, expiryTimestamp);

      console.log(`\tdeltaSmall is ${delta.toString()}`);
      console.log(`\tdeltaLarger is ${deltaLarger.toString()}`);

      assert.equal(delta.toString(), "5455");

      assert.isAbove(parseInt(delta.toString()), 5000);
      assert.isBelow(
        parseInt(delta.toString()),
        parseInt(deltaLarger.toString())
      );
    });

    it("fits the gas budget", async function () {
      const strikePriceLarger = underlyingPrice.sub(
        BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      );

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
});

