import hre, { ethers } from "hardhat";
import { expect } from "chai";

const { parseEther } = ethers.utils;

describe("Math", () => {
  describe("Gas use", () => {
    it("gas", async function () {
      const TestMath = await ethers.getContractFactory("TestMath");
      const testMath = await TestMath.deploy();
      const hegicGas = await testMath.testHegic(86400);
      const bsGas = await testMath.testBS(86400);
      const prbGas = await testMath.testPRB(86400);

      console.log("hegic", hegicGas.toNumber());
      console.log("bs", bsGas.toNumber());
      console.log("prb", prbGas.toNumber());
    });
  });
});
