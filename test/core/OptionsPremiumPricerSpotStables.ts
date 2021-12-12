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

describe("OptionsPremiumPricer (Spot-Stables)", () => {
  let mockOracle: Contract;
  let optionsPremiumPricer: Contract;
  let testOptionsPremiumPricer: Contract;
  let wethPriceOracle: Contract;
  let signer: SignerWithAddress;
  let underlyingPrice: BigNumber;
  let underlyingPriceShifted: BigNumber;

  const PERIOD = 43200; // 12 hours
  const WINDOW_IN_DAYS = 7; // weekly vol data
  const WEEK = 604800; // 7 days
  const WAD = BigNumber.from(10).pow(18);
  const STABLE_DECIMALS = BigNumber.from(10).pow(6);

  // const ethusdcPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
  // const bzrxethPool = "0x4f25F309FbE94771e4F636D5D433A8f8Cd5C332B";
  // const perpusdcPool = "0xcD83055557536EFf25FD0eAfbC56e74a1b4260B3";
  const uniusdcPool = "0xD0fC8bA7E267f2bc56044A7715A489d851dC6D78";
  // const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  // const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  // const bzrxPriceOracleAddress = "0x8f7c7181ed1a2ba41cfc3f5d064ef91b67daef66";
  // const perpPriceOracleAddress = "0x8f7c7181ed1a2ba41cfc3f5d064ef91b67daef66";
  const uniPriceOracleAddress = "0x553303d460ee0afb37edff9be42922d8ff63220e";
  const wethPriceOracleAddress = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const usdcPriceOracleAddress = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";

  const pool = uniusdcPool;

  before(async function () {
    [signer] = await ethers.getSigners();
    const TestVolOracle = await getContractFactory("TestVolOracle", signer);
    const OptionsPremiumPricer = await getContractFactory(
      "OptionsPremiumPricer",
      signer
    );
    const TestOptionsPremiumPricer = await getContractFactory(
      "TestOptionsPremiumPricer",
      signer
    );

    mockOracle = await TestVolOracle.deploy(PERIOD, WINDOW_IN_DAYS);

    optionsPremiumPricer = await OptionsPremiumPricer.deploy(
      uniusdcPool,
      mockOracle.address,
      uniPriceOracleAddress,
      usdcPriceOracleAddress,
      wethPriceOracleAddress
    );
    testOptionsPremiumPricer = await TestOptionsPremiumPricer.deploy(
      uniusdcPool,
      mockOracle.address,
      uniPriceOracleAddress,
      usdcPriceOracleAddress,
      wethPriceOracleAddress
    );

    wethPriceOracle = await ethers.getContractAt(
      "IPriceOracle",
      await optionsPremiumPricer.priceOracle()
    );
  
    let oracleDecimals = 8
    underlyingPrice = await optionsPremiumPricer.getUnderlyingPrice();
    underlyingPriceShifted = (
      await optionsPremiumPricer.getUnderlyingPrice()
    ).mul(BigNumber.from(10).pow(18 - oracleDecimals));
  });

  describe("#getPremiumInStables", () => {
    time.revertToSnapshotAfterEach();

    beforeEach(async () => {
      await updateVol(pool);
    });

    it("reverts on timestamp being in the past", async function () {
      // console.log("\t"+(await optionsPremiumPricer.getUnderlyingPrice()).toString())
      // console.log("\t"+(await optionsPremiumPricer.getStablePrice()).toString())
      // console.log("\t"+(await optionsPremiumPricer.getNativeTokenPrice()).toString())

      const expiryTimestamp = (await time.now()).sub(WEEK);
      await expect(
        optionsPremiumPricer.getPremiumInStables(0, expiryTimestamp, true)
      ).to.be.revertedWith("Expiry must be in the future!");
    });

    it("gets the correct premium", async function () {
      // const underlyingStrikeDiff = 200;
      // const strikePrice = underlyingPrice.add(
      //   BigNumber.from(underlyingStrikeDiff).mul(BigNumber.from(10).pow(8))
      // );
      const strikePrice = underlyingPrice.mul(110000).div(100000)
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

      assert.isAbove(
        parseInt(premiumInStables.toString()), 
        parseInt(math.wmul(premium, underlyingPriceShifted).toString())
      )

      console.log("\t"+
        `premium is ${math.wmul(premium, underlyingPriceShifted).toString()}`
      );

      // assert.equal(
      //   math.wmul(premium, underlyingPriceShifted).div(WAD).toString(),
      //   "142"
      // ); Disabled for now

      // assert.isAbove(
      //   parseInt(math.wmul(premium, underlyingPriceShifted).toString()),
      //   parseInt(
      //     BigNumber.from(underlyingStrikeDiff)
      //       .mul(BigNumber.from(10).pow(8))
      //       .toString()
      //   )
      // );
    });

    it("gives more expensive put than call if strikePrice above current price", async function () {
      // const strikePrice = underlyingPrice.add(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePrice = underlyingPrice.mul(110000).div(100000)
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

      console.log("\t"+`premiumCall is ${premiumCall}`);
      console.log("\t"+`premiumPut is ${premiumPut}`);
      
      // assert.equal(premiumPut.div(STABLE_DECIMALS).toString(), "413");
      // assert.equal(
      //   math.wmul(premiumCall, underlyingPriceShifted).div(STABLE_DECIMALS).toString(),
      //   "113"
      // ); Disabled for now

      assert.isAbove(
        parseInt(premiumPut.toString()),
        parseInt(premiumCall.toString())
      );
    });

    it("gives more expensive call than put if strikePrice below current price", async function () {
      // const strikePrice = underlyingPrice.sub(
      //   BigNumber.from(200).mul(BigNumber.from(10).pow(8))
      // );
      const strikePrice = underlyingPrice.mul(90000).div(100000)
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

      console.log("\t"+`premiumCall is ${premiumCall}`);
      console.log("\t"+`premiumPut is ${premiumPut}`);

      // assert.equal(premiumPut.div(STABLE_DECIMALS).toString(), "125");
      // assert.equal(
      //   math.wmul(premiumCall, underlyingPriceShifted).div(STABLE_DECIMALS).toString(),
      //   "325"
      // ); Disabled for now

      assert.isAbove(
        parseInt(premiumCall.toString()),
        parseInt(premiumPut.toString())
      );
    });

    it("gives smaller premium price for option with extremely OTM strike price", async function () {
      // const strikePriceSmall = underlyingPrice.add(
      //   BigNumber.from(200).mul(BigNumber.from(10).pow(8))
      // );
      // const strikePriceBig = BigNumber.from(
      //   await optionsPremiumPricer.getUnderlyingPrice()
      // ).add(BigNumber.from(1000).mul(BigNumber.from(10).pow(8)));
      const strikePriceSmall = underlyingPrice.mul(110000).div(100000)
      const strikePriceBig = underlyingPrice.mul(120000).div(100000)
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

      console.log("\t"+`premiumSmall is ${premiumSmall}`);
      console.log("\t"+`premiumBig is ${premiumSmall}`);

      // assert.equal(
      //   math.wmul(premiumSmall, underlyingPriceShifted).div(STABLE_DECIMALS).toString(),
      //   "142"
      // );
      // assert.equal(
      //   math.wmul(premiumBig, underlyingPriceShifted).div(STABLE_DECIMALS).toString(),
      //   "18"
      // );

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

      console.log("\t"+`premiumCall is ${premiumPut}`);
      console.log("\t"+`premiumPut is ${premiumPut}`);

      // assert.equal(
      //   math.wmul(premiumCall, underlyingPriceShifted).div(STABLE_DECIMALS).toString(),
      //   "220"
      // );
      // assert.equal(premiumPut.div(STABLE_DECIMALS).toString(), "220");

      // Broke it up into range because with calls we go from usd -> eth -> usd,
      // whereas with puts we go usd -> usdc which is not 100% equal so it ends up being a bit less
      // assert.isAbove(
      //   parseInt(premiumCall),
      //   (parseInt(premiumPut.toString()) * 99) / 100
      // );

      assert.equal(
        parseInt(premiumPut.toString()),
        parseInt(premiumCall)
      );
    });

    it("gives more expensive price for expiry twice as far out from now", async function () {
      // const strikePrice = underlyingPrice.add(
      //   BigNumber.from(200).mul(BigNumber.from(10).pow(8))
      // );
      const strikePrice = underlyingPrice.mul(110000).div(100000)
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

      console.log("\t"+
        `premiumSmallTimestamp is ${premiumSmallTimestamp}`
      );
      console.log("\t"+
        `premiumBigTimestamp is ${premiumBigTimestamp}`
      );

      // assert.equal(
      //   math
      //     .wmul(premiumSmallTimestamp, underlyingPriceShifted)
      //     .div(WAD)
      //     .toString(),
      //   "142"
      // );
      // assert.equal(
      //   math
      //     .wmul(premiumBigTimestamp, underlyingPriceShifted)
      //     .div(WAD)
      //     .toString(),
      //   "233"
      // );

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
      // const strikePrice = underlyingPrice.add(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePrice = underlyingPrice.mul(110000).div(100000)
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

      assert.isAtMost(callGas.toNumber(), 73920);
      assert.isAtMost(putGas.toNumber(), 73909);
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
      // const strikePrice = underlyingPrice.add(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePrice = underlyingPrice.mul(110000).div(100000)
      
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      console.log("\t"+`delta is ${delta.toString()}`);

      // assert.equal(delta.toString(), "3457"); Disabled for now
      assert.isBelow(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike < underlying", async function () {
      // const strikePrice = underlyingPrice.sub(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePrice = underlyingPrice.mul(90000).div(100000)
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      console.log("\t"+`delta is ${delta.toString()}`);

      // assert.equal(delta.toString(), "7560"); Disabled for now
      assert.isAbove(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike = underlying", async function () {
      const strikePrice = underlyingPrice;
      // const strikePriceLarger = underlyingPrice.sub(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePriceLarger = underlyingPrice.mul(90000).div(100000)

      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePrice, expiryTimestamp);

      const deltaLarger = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256)"
      ](strikePriceLarger, expiryTimestamp);

      console.log("\t"+`deltaSmall is ${delta.toString()}`);
      console.log("\t"+`deltaLarger is ${deltaLarger.toString()}`);

      // assert.equal(delta.toString(), "5455"); Disabled for now

      assert.isAbove(parseInt(delta.toString()), 5000);
      assert.isBelow(
        parseInt(delta.toString()),
        parseInt(deltaLarger.toString())
      );
    });

    it("fits the gas budget", async function () {
      // const strikePriceLarger = underlyingPrice.sub(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePriceLarger = underlyingPrice.mul(90000).div(100000)

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
      // const strikePrice = underlyingPrice.add(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePrice = underlyingPrice.mul(110000).div(100000)
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      console.log("\t"+`delta is ${delta.toString()}`);

      // assert.equal(delta.toString(), "3457"); Disabled for now
      assert.isBelow(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike < underlying", async function () {
      // const strikePrice = underlyingPrice.sub(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePrice = underlyingPrice.mul(90000).div(100000)
      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      console.log("\t"+`delta is ${delta.toString()}`);

      // assert.equal(delta.toString(), "7560"); Disabled for now
      assert.isAbove(parseInt(delta.toString()), 5000);
    });

    it("gets the correct option delta for strike = underlying", async function () {
      const strikePrice = underlyingPrice;
      // const strikePriceLarger = underlyingPrice.sub(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePriceLarger = underlyingPrice.mul(90000).div(100000)

      const expiryTimestamp = (await time.now()).add(WEEK);

      const delta = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePrice, annualizedVol, expiryTimestamp);

      const deltaLarger = await optionsPremiumPricer[
        "getOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePriceLarger, annualizedVol, expiryTimestamp);

      console.log("\t"+`deltaSmall is ${delta.toString()}`);
      console.log("\t"+`deltaLarger is ${deltaLarger.toString()}`);

      // assert.equal(delta.toString(), "5455"); Disabled for now

      assert.isAbove(parseInt(delta.toString()), 5000);
      assert.isBelow(
        parseInt(delta.toString()),
        parseInt(deltaLarger.toString())
      );
    });

    it("fits the gas budget", async function () {
      // const strikePriceLarger = underlyingPrice.sub(
      //   BigNumber.from(300).mul(BigNumber.from(10).pow(8))
      // );
      const strikePriceLarger = underlyingPrice.mul(90000).div(100000)

      const expiryTimestamp = (await time.now()).add(WEEK);

      const { gas } = await testOptionsPremiumPricer[
        "testGetOptionDelta(uint256,uint256,uint256,uint256)"
      ](underlyingPrice, strikePriceLarger, annualizedVol, expiryTimestamp);

      assert.isAtMost(gas.toNumber(), 49000);
      // console.log("\t"+"getOptionDelta:", gas.toNumber());
    });
  });

  describe("#derivatives", () => {
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

    await mockOracle.initPool(pool);

    for (let i = 0; i < values.length; i++) {
      await mockOracle.setPrice(values[i]);
      const topOfPeriod = (await getTopOfPeriod()) + PERIOD;
      await time.increaseTo(topOfPeriod);
      await mockOracle.mockCommit(pool);
    }
  };
});
