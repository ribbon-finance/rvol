import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { Contract } from "@ethersproject/contracts";
import moment from "moment-timezone";
import * as time from "../helpers/time";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "@ethersproject/bignumber";
import "mocha";

const { getContractFactory } = ethers;

moment.tz.setDefault("UTC");

describe("ManualVolOracle", () => {
  let oracle: Contract;
  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;

  const ethusdcPool = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
  const wbtcusdcPool = "0x99ac8ca7087fa4a2a1fb6357269965a2014abc35";

  before(async function () {
    [signer, signer2] = await ethers.getSigners();
    const ManualVolOracle = await getContractFactory("ManualVolOracle", signer);

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
        oracle.connect(signer2).setAnnualizedVol([ethusdcPool], [annualizedVol])
      ).to.be.revertedWith("!admin");
    });

    it("reverts when passing 0 as annualized vol", async function () {
      let annualizedVol = 0;
      await expect(
        oracle.setAnnualizedVol([ethusdcPool], [annualizedVol])
      ).to.be.revertedWith("Cannot be less than 50%");
    });

    it("reverts when passing <50% as annualized vol", async function () {
      await expect(
        oracle.setAnnualizedVol(
          [ethusdcPool],
          [BigNumber.from(50).mul(BigNumber.from(10).pow(6))]
        )
      ).to.be.revertedWith("Cannot be less than 50%");
    });

    it("reverts when passing >400% as annualized vol", async function () {
      await expect(
        oracle.setAnnualizedVol(
          [ethusdcPool],
          [BigNumber.from(400).mul(BigNumber.from(10).pow(6))]
        )
      ).to.be.revertedWith("Cannot be more than 400%");
    });

    it("reverts when pool array length and annualized vol length mismatch", async function () {
      let ethAnnualizedVol = BigNumber.from(10).pow(8);
      await expect(
        oracle.setAnnualizedVol(
          [ethusdcPool, wbtcusdcPool],
          [ethAnnualizedVol])
      ).to.be.revertedWith("Input lengths mismatched");
    });

    it("reverts when setting the same pool twice", async function () {
      let ethAnnualizedVol = BigNumber.from(10).pow(8);
      await expect(
        oracle.setAnnualizedVol(
          [ethusdcPool, ethusdcPool],
          [ethAnnualizedVol, ethAnnualizedVol])
      ).to.be.revertedWith("Cannot set vol for the same pool twice");
    });

    it("sets the annualized vol for the pool", async function () {
      let annualizedVol = BigNumber.from(10).pow(8);
      await oracle.setAnnualizedVol([ethusdcPool], [annualizedVol]);
      assert.equal(
        (await oracle.annualizedVol(ethusdcPool)).toString(),
        annualizedVol.toString()
      );
    });

    it("sets the annualized vol for multiple pools", async function () {
      let ethAnnualizedVol = BigNumber.from(10).pow(8);
      let wbtcAnnualizedVol = BigNumber.from(10).pow(8).mul(2);
      await oracle.setAnnualizedVol([ethusdcPool, wbtcusdcPool], [ethAnnualizedVol, wbtcAnnualizedVol]);
      assert.equal(
        (await oracle.annualizedVol(ethusdcPool)).toString(),
        ethAnnualizedVol.toString()
      );
      assert.equal(
        (await oracle.annualizedVol(wbtcusdcPool)).toString(),
        wbtcAnnualizedVol.toString()
      );
    });

    it("fits gas budget (single) [ @skip-on-coverage ]", async function () {
      let annualizedVol = BigNumber.from(10).pow(8);
      const tx = await oracle.setAnnualizedVol([ethusdcPool], [annualizedVol]);
      const receipt = await tx.wait();
      console.log(receipt.gasUsed.toNumber());
      assert.isAtMost(receipt.gasUsed.toNumber(), 51000);
    });

    it("fits gas budget (multi) [ @skip-on-coverage ]", async function () {
      let ethAnnualizedVol = BigNumber.from(10).pow(8);
      let wbtcAnnualizedVol = BigNumber.from(10).pow(8).mul(2);

      const tx = await oracle.setAnnualizedVol([ethusdcPool, wbtcusdcPool], [ethAnnualizedVol, wbtcAnnualizedVol]);
      const receipt = await tx.wait();
      console.log(receipt.gasUsed.toNumber());
      assert.isAtMost(receipt.gasUsed.toNumber(), 77000);
    });
  });

  describe("grantRole", () => {
    it("grants role to new admin", async () => {
      const adminRole = await oracle.ADMIN_ROLE();

      await oracle.grantRole(adminRole, signer2.address);

      assert.isTrue(await oracle.hasRole(adminRole, signer2.address));

      const annualizedVol = BigNumber.from(10).pow(8);
      await oracle
        .connect(signer2)
        .setAnnualizedVol([ethusdcPool], [annualizedVol]);
    });

    it("is able to grant default admin role", async () => {
      const DEFAULT_ADMIN_ROLE =
        "0x0000000000000000000000000000000000000000000000000000000000000000";

      await oracle.grantRole(DEFAULT_ADMIN_ROLE, signer2.address);

      assert.isTrue(await oracle.hasRole(DEFAULT_ADMIN_ROLE, signer2.address));
    });
  });
});
