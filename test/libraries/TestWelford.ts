import { ethers } from "hardhat";
import { assert } from "chai";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { parseEther, formatUnits, parseUnits } from "@ethersproject/units";

const stdev = (values: BigNumber[]) => {
  let sum = BigNumber.from(0);
  for (let i = 0; i < values.length; i++) {
    sum = sum.add(values[i]);
  }
  const mean = sum.div(values.length);

  let sumOfSquares = BigNumber.from(0);

  for (let i = 0; i < values.length; i++) {
    sumOfSquares = sumOfSquares.add(values[i].sub(mean).pow(2));
  }

  const sd = Math.floor(
    Math.sqrt(sumOfSquares.toNumber() / (values.length - 1))
  );
  return sd;
};

describe("Welford", () => {
  let testWelford: Contract;

  before(async () => {
    const TestWelford = await ethers.getContractFactory("TestWelford");
    testWelford = await TestWelford.deploy();
  });

  describe("stdev", () => {
    it("matches stdev", async function () {
      let values: BigNumber[] = [];
      const start = 2000;
      const numValues = 30;
      for (let i = 0; i < numValues; i++) {
        values.push(parseUnits((start + i).toString(), 6));
      }

      for (let i = 0; i < values.length; i++) {
        await testWelford.update(values[i]);
      }
      const welfordStdev = await testWelford.stdev();
      const actualStdev = stdev(values);

      // As the number of records increase, Welford's online algorithm's error rate will go down
      // At 30 records, the error rate is <2%
      assert.isAtMost(
        (actualStdev - welfordStdev.toNumber()) / welfordStdev,
        0.02
      );
      assert.equal(welfordStdev.toNumber(), 8655441);
    });
  });
});
