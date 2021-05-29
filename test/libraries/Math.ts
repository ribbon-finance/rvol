import { ethers } from "hardhat";
import { assert } from "chai";
import { Contract } from "@ethersproject/contracts";

const { parseEther } = ethers.utils;

describe("Math", () => {
  let testMath: Contract;

  before(async () => {
    const TestMath = await ethers.getContractFactory("TestMath");
    testMath = await TestMath.deploy();
  });

  describe("stdev", () => {
    it("gas", async function () {
      const [, gasUsed] = await testMath.testStdev([
        parseEther("1"),
        parseEther("1.1"),
        parseEther("1.2"),
        parseEther("1.3"),
        parseEther("1.4"),
        parseEther("1.5"),
        parseEther("1.6"),
        parseEther("1.7"),
      ]);
      assert.equal(gasUsed, 3626);
    });
  });

  describe("sqrt", () => {
    it("gas", async function () {
      const prbGas = await testMath.testPRB(86400);
      assert.equal(prbGas, 667);
    });
  });
});
