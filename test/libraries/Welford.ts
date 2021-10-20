import { ethers } from "hardhat";
import { assert } from "chai";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { parseUnits } from "@ethersproject/units";
import * as time from "../helpers/time";

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

  describe("update", () => {
    time.revertToSnapshotAfterEach();

    it("takes in negative values", async function () {
      await testWelford.update(-100);
      assert.equal((await testWelford.count()).toString(), "1");
      assert.equal((await testWelford.mean()).toString(), BigNumber.from(-100));
      assert.equal((await testWelford.m2()).toString(), BigNumber.from(0));

      await testWelford.update(-200);
      assert.equal((await testWelford.count()).toString(), "2");
      assert.equal((await testWelford.mean()).toString(), BigNumber.from(-150));
      assert.equal((await testWelford.m2()).toString(), BigNumber.from(5000));

      assert.equal((await testWelford.stdev()).toString(), "50");
    });
  });

  describe("stdev", () => {
    time.revertToSnapshotAfterEach();

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
