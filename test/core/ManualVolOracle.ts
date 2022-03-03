import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { Contract } from "@ethersproject/contracts";
import moment from "moment-timezone";
import * as time from "../helpers/time";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "@ethersproject/bignumber";
import { parseUnits } from "ethers/lib/utils";

const { getContractFactory } = ethers;

moment.tz.setDefault("UTC");

describe("ManualVolOracle", () => {
  let oracle: Contract;
  let signer: SignerWithAddress;
  let signer2: SignerWithAddress;

  const delta = 1000;
  const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
  let wethOption: string;
  let wbtcOption: string;

  before(async function () {
    [signer, signer2] = await ethers.getSigners();
    const ManualVolOracle = await getContractFactory("ManualVolOracle", signer);

    oracle = await ManualVolOracle.deploy(signer.address);

    wethOption = await oracle.getOptionId(delta, weth, weth, false);
    wbtcOption = await oracle.getOptionId(delta, wbtc, wbtc, false);
  });

  describe("vol", () => {
    it("returns 0 for vol()", async function () {
      assert.equal((await oracle.vol(wethOption)).toString(), "0");
    });
  });

  describe("setAnnualizedVol", () => {
    time.revertToSnapshotAfterEach();

    it("reverts when caller not admin", async function () {
      let annualizedVol = 1;
      await expect(
        oracle.connect(signer2).setAnnualizedVol([wethOption], [annualizedVol])
      ).to.be.revertedWith("!admin");
    });

    it("reverts when passing 0 as annualized vol", async function () {
      let annualizedVol = 0;
      await expect(
        oracle.setAnnualizedVol([wethOption], [annualizedVol])
      ).to.be.revertedWith("Cannot be less than 50%");
    });

    it("reverts when passing <50% as annualized vol", async function () {
      await expect(
        oracle.setAnnualizedVol(
          [wethOption],
          [BigNumber.from(50).mul(BigNumber.from(10).pow(6))]
        )
      ).to.be.revertedWith("Cannot be less than 50%");
    });

    it("reverts when passing >400% as annualized vol", async function () {
      await expect(
        oracle.setAnnualizedVol(
          [wethOption],
          [BigNumber.from(400).mul(BigNumber.from(10).pow(6))]
        )
      ).to.be.revertedWith("Cannot be more than 400%");
    });

    it("reverts when pool array length and annualized vol length mismatch", async function () {
      let ethAnnualizedVol = BigNumber.from(10).pow(8);
      await expect(
        oracle.setAnnualizedVol([wethOption, wbtcOption], [ethAnnualizedVol])
      ).to.be.revertedWith("Input lengths mismatched");
    });

    it("sets the annualized vol for the pool", async function () {
      let annualizedVol = BigNumber.from(10).pow(8);
      await oracle.setAnnualizedVol([wethOption], [annualizedVol]);
      assert.equal(
        (await oracle["annualizedVol(bytes32)"](wethOption)).toString(),
        annualizedVol.toString()
      );
    });

    it("sets the annualized vol for multiple pools", async function () {
      let ethAnnualizedVol = BigNumber.from(10).pow(8);
      let wbtcAnnualizedVol = BigNumber.from(10).pow(8).mul(2);
      await oracle.setAnnualizedVol(
        [wethOption, wbtcOption],
        [ethAnnualizedVol, wbtcAnnualizedVol]
      );
      assert.equal(
        (await oracle["annualizedVol(bytes32)"](wethOption)).toString(),
        ethAnnualizedVol.toString()
      );
      assert.equal(
        (await oracle["annualizedVol(bytes32)"](wbtcOption)).toString(),
        wbtcAnnualizedVol.toString()
      );
    });

    it("fits gas budget (single) [ @skip-on-coverage ]", async function () {
      let annualizedVol = BigNumber.from(10).pow(8);
      const tx = await oracle.setAnnualizedVol([wethOption], [annualizedVol]);
      const receipt = await tx.wait();
      // console.log(receipt.gasUsed.toNumber());
      assert.isAtMost(receipt.gasUsed.toNumber(), 48000);
    });

    it("fits gas budget (multi) [ @skip-on-coverage ]", async function () {
      let ethAnnualizedVol = BigNumber.from(10).pow(8);
      let wbtcAnnualizedVol = BigNumber.from(10).pow(8).mul(2);

      const tx = await oracle.setAnnualizedVol(
        [wethOption, wbtcOption],
        [ethAnnualizedVol, wbtcAnnualizedVol]
      );
      const receipt = await tx.wait();
      // console.log(receipt.gasUsed.toNumber());
      assert.isAtMost(receipt.gasUsed.toNumber(), 71000);
    });
  });

  describe("annualizedVol", () => {
    time.revertToSnapshotAfterEach();

    const annualizedVol = parseUnits("1", 8);

    before(async () => {
      await oracle.setAnnualizedVol([wethOption], [annualizedVol]);
    });

    it("reads the vol after setting", async () => {
      assert.equal(
        (await oracle["annualizedVol(bytes32)"](wethOption)).toString(),
        annualizedVol.toString()
      );
    });

    it("reads the vol with unencoded option parameters", async () => {
      assert.equal(
        (
          await oracle["annualizedVol(uint256,address,address,bool)"](
            delta,
            weth,
            weth,
            false
          )
        ).toString(),
        annualizedVol.toString()
      );
    });
  });

  describe("getOptionId", () => {
    it("encodes the option id correctly", async () => {
      assert.equal(
        await oracle.getOptionId(delta, weth, weth, false),
        "0x0918a549fd71883e904c96e5ca3e87cb2638815cae382651e3b7d213163455d7"
      );
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
        .setAnnualizedVol([wethOption], [annualizedVol]);
    });

    it("is able to grant default admin role", async () => {
      const DEFAULT_ADMIN_ROLE =
        "0x0000000000000000000000000000000000000000000000000000000000000000";

      await oracle.grantRole(DEFAULT_ADMIN_ROLE, signer2.address);

      assert.isTrue(await oracle.hasRole(DEFAULT_ADMIN_ROLE, signer2.address));
    });
  });
});
