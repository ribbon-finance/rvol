import { ethers } from "hardhat";
import { assert } from "chai";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "ethers";
import { pricesToReturns } from "../helpers/math";

describe("Math", () => {
  let testMath: Contract;

  before(async () => {
    const TestMath = await ethers.getContractFactory("TestMath");
    testMath = await TestMath.deploy();
  });

  describe("stdev", () => {
    it("gas", async function () {
      const [result, gasUsed] = await testMath.testStdev(
        pricesToReturns([
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
        ])
      );
      assert.equal(gasUsed.toNumber(), 4926);
      assert.equal(result.toString(), "68190148968167441");
    });
  });

  describe("sqrt", () => {
    it("gas", async function () {
      const prbGas = await testMath.testPRB(86400);
      assert.equal(prbGas, 667);
    });
  });
});
