import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { Contract } from "@ethersproject/contracts";
import moment from "moment-timezone";
import * as time from "../helpers/time";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { getContractFactory } = ethers;

moment.tz.setDefault("UTC");

describe("ManualVolOracle", () => {
  let oracle: Contract;
  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;

  const ethusdcPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";

  before(async function () {
    [signer, signer2] = await ethers.getSigners();
    const ManualVolOracle = await getContractFactory("VolOracle", signer);

    oracle = await ManualVolOracle.deploy(signer.address);
  });

  describe("vol", () => {
    it("returns 0 for vol()", async function () {
      assert.equal((await oracle.vol(ethusdcPool)).toString(), "0");
    });
  });

  describe("setAnnualizedVol", () => {
    time.revertToSnapshotAfterEach();

    it("reverts when caller not admin", async function () {
      let annualizedVol = 1;
      await expect(
        oracle.connect(signer2).setAnnualizedVol(ethusdcPool, annualizedVol)
      ).to.be.revertedWith("!admin");
    });

    it("reverts when passing 0 as annualized vol", async function () {
      let annualizedVol = 0;
      await expect(
        oracle.setAnnualizedVol(ethusdcPool, annualizedVol)
      ).to.be.revertedWith("!annualizedVol");
    });

    it("sets the annualized vol for the pool", async function () {
      let annualizedVol = 1;
      await oracle.setAnnualizedVol(ethusdcPool, annualizedVol);
      assert.equal(
        (await oracle.annualizedVol(ethusdcPool)).toString(),
        annualizedVol.toString()
      );
    });
  });
});
