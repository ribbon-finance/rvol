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
  let optionId: String

  const WEEK = 604800; // 7 days
  const DIVIDER = BigNumber.from(10).pow(10);

  const bzrx = "0x56d811088235F11C8920698a204A5010a788f4b3"
  const delta = 1000;

  const bzrxPriceOracleAddress = "0x8f7c7181ed1a2ba41cfc3f5d064ef91b67daef66";
  const wethPriceOracleAddress = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const usdcPriceOracleAddress = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

  before(async function () {
    [signer] = await ethers.getSigners();
    const TestVolOracle = await getContractFactory("ManualVolOracle", signer);
    const OptionsPremiumPricer = await getContractFactory(
      "OptionsPremiumPricerInETH",
      signer
    );
    const TestOptionsPremiumPricer = await getContractFactory(
      "TestOptionsPremiumPricerInETH",
      signer
    );

    mockOracle = await TestVolOracle.deploy(signer.address);

    optionId = await mockOracle.getOptionId(
      delta,
      bzrx,
      bzrx,
      false
    )

    await mockOracle.setAnnualizedVol([optionId], [165273561]);

    optionsPremiumPricer = await OptionsPremiumPricer.deploy(
      optionId,
      mockOracle.address,
      bzrxPriceOracleAddress,
      usdcPriceOracleAddress,
      wethPriceOracleAddress
    );
    testOptionsPremiumPricer = await TestOptionsPremiumPricer.deploy(
      optionId,
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
        math.wmul(premium, underlyingPriceShifted).div(DIVIDER).toString(),
        "1625177"
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

      assert.equal(premiumPut.div(DIVIDER).toString(), "4645977");
      assert.equal(
        math.wmul(premiumCall, underlyingPriceShifted).div(DIVIDER).toString(),
        "1625177"
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

      assert.equal(premiumPut.div(DIVIDER).toString(), "1375000");
      assert.equal(
        math.wmul(premiumCall, underlyingPriceShifted).div(DIVIDER).toString(),
        "4395799"
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
        math.wmul(premiumSmall, underlyingPriceShifted).div(DIVIDER).toString(),
        "1625177"
      );
      assert.equal(
        math.wmul(premiumBig, underlyingPriceShifted).div(DIVIDER).toString(),
        "912400"
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
        math.wmul(premiumCall.div(DIVIDER), underlyingPriceShifted).toString(),
        "2752279"
      );
      assert.equal(premiumPut.div(DIVIDER).toString(), "2752279");

      assert.equal(
        parseInt(premiumPut.div(DIVIDER).toString()),
        parseInt(math.wmul(premiumCall.div(DIVIDER), underlyingPriceShifted).toString())
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
          .div(DIVIDER)
          .toString(),
        "1625177"
      );
      assert.equal(
        math
          .wmul(premiumBigTimestamp, underlyingPriceShifted)
          .div(DIVIDER)
          .toString(),
        "2741452"
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
        "16251771084800000"
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

      assert.equal(premiumPut.div(DIVIDER).toString(), "4645977");
      assert.equal(premiumCall.div(DIVIDER).toString(), "1625177");

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

      assert.equal(premiumPut.div(DIVIDER).toString(), "1375000");
      assert.equal(premiumCall.div(DIVIDER).toString(), "4395800");

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

      assert.equal(premiumSmall.div(DIVIDER).toString(), "1625177");
      assert.equal(premiumBig.div(DIVIDER).toString(), "912400");

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

      assert.equal(premiumPut.div(DIVIDER).toString(), "2752279");
      assert.equal(premiumPut.div(DIVIDER).toString(), "2752279");

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

      assert.equal(premiumSmallTimestamp.div(DIVIDER).toString(), "1625177");
      assert.equal(premiumBigTimestamp.div(DIVIDER).toString(), "2741452");

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

      assert.equal(delta.toString(), "3813");
      assert.isBelow(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike < underlying", async function () {
      const strikePrice = underlyingPrice.mul(90000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "7172");
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

      assert.equal(delta.toString(), "5455");

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
      annualizedVol = (
        await mockOracle["annualizedVol(uint256,address,address,bool)"](
          delta,
          bzrx,
          bzrx,
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
      const strikePrice = underlyingPrice.mul(110000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "3813");
      assert.isBelow(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike < underlying", async function () {
      const strikePrice = underlyingPrice.mul(90000).div(100000);
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      console.log(`\tdelta is ${delta.toString()}`);

      assert.equal(delta.toString(), "7172");
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

      assert.equal(delta.toString(), "5455");

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
});

