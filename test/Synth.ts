import { expect } from "chai";
import { ethers } from "hardhat";
import { MockOracle, Reserve, SafeDecimalMath, Synth } from "../typechain";
import { beforeEach, describe, it } from "mocha";

import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  deployMockOracle,
  deployReserve,
  deploySafeDecimalMath,
  deploySynth,
} from "./shared/constructor";

describe("#Synth", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let oracle: MockOracle;
  let synth: Synth;
  let decimal: number;
  let unit: BigNumber;
  const tokenName = "CryptoPunks";
  const tokenSymbol = "$PUNK";

  beforeEach(async function () {
    librarySafeDecimalMath = await deploySafeDecimalMath();
    decimal = await librarySafeDecimalMath.decimals();
    unit = await librarySafeDecimalMath.UNIT();
    oracle = await deployMockOracle();
  });

  const setUp = async function (
    minCollateralRatio: BigNumber,
    liquidationPenalty: BigNumber
  ) {
    reserve = await deployReserve(
      librarySafeDecimalMath,
      minCollateralRatio,
      liquidationPenalty
    );
    synth = await deploySynth(reserve, oracle, tokenName, tokenSymbol);
  };

  it("Mint burn Synth", async function () {
    await setUp(
      ethers.utils.parseUnits("1.5", decimal),
      ethers.utils.parseUnits("1.25", decimal)
    );

    const [owner, signer1, signer2] = await ethers.getSigners();

    await synth.mintWithETH(signer1.address, BigNumber.from(10).mul(unit));
    await synth.mintWithETH(signer2.address, BigNumber.from(20).mul(unit));

    const assertBalance = async function (address: string, balance: BigNumber) {
      expect(await reserve.getMinterDebtETH(address)).to.equal(balance);
      expect(await synth.balanceOf(address)).to.equal(balance);
    };

    await assertBalance(signer1.address, BigNumber.from(10).mul(unit));
    await assertBalance(signer2.address, BigNumber.from(20).mul(unit));
    expect(await synth.totalSupply()).to.equal(BigNumber.from(30).mul(unit));

    await synth
      .connect(signer1)
      .approve(owner.address, BigNumber.from(5).mul(unit));
    await synth
      .connect(signer2)
      .approve(owner.address, BigNumber.from(25).mul(unit));
    await synth.burnFromWithETH(
      signer1.address,
      signer1.address,
      BigNumber.from(5).mul(unit)
    );
    await synth.burnFromWithETH(
      signer2.address,
      signer2.address,
      BigNumber.from(20).mul(unit)
    );
    await assertBalance(signer1.address, BigNumber.from(5).mul(unit));
    await assertBalance(signer2.address, BigNumber.from(0).mul(unit));
    expect(await synth.totalSupply()).to.equal(BigNumber.from(5).mul(unit));
  });

  describe("Liquidation delinquent account", function () {
    let liquidatorSigner: SignerWithAddress;
    let ownerAddress: string;
    let minterAddress: string;
    let liquidatorAddress: string;

    beforeEach(async function () {
      await setUp(
        ethers.utils.parseUnits("1.5", decimal),
        ethers.utils.parseUnits("1.2", decimal)
      );

      const [owner, minter, liquidator] = await ethers.getSigners();
      liquidatorSigner = liquidator;
      ownerAddress = owner.address;
      minterAddress = minter.address;
      liquidatorAddress = liquidator.address;
    });

    const setMinterDebtDeposit = async function (
      debt: BigNumber,
      deposit: BigNumber,
      assetPrice: BigNumber
    ) {
      await Promise.all([
        reserve.addMinterDebtETH(minterAddress, debt),
        reserve.addMinterDepositETH(minterAddress, deposit),
        oracle.setAssetPrice(tokenName, assetPrice),
      ]);
    };

    it("Not liquidable", async function () {
      await setMinterDebtDeposit(
        BigNumber.from(10).mul(unit),
        BigNumber.from(1600).mul(unit),
        BigNumber.from(100).mul(unit)
      );
      await expect(
        synth.liquidateDelinquentAccount(minterAddress, 10, liquidatorAddress)
      ).to.be.revertedWith(
        await synth.ERR_LIQUIDATE_ABOVE_MIN_COLLATERAL_RATIO()
      );
    });

    it("Liquidator does not have enough synthNFTs", async function () {
      await setMinterDebtDeposit(
        BigNumber.from(10).mul(unit),
        BigNumber.from(1400).mul(unit),
        BigNumber.from(100).mul(unit)
      );
      await synth.mintWithETH(liquidatorAddress, BigNumber.from(5).mul(unit));
      await expect(
        synth.liquidateDelinquentAccount(
          minterAddress,
          BigNumber.from(6).mul(unit),
          liquidatorAddress
        )
      ).to.be.revertedWith(await synth.ERR_LIQUIDATE_NOT_ENOUGH_SYNTH());
    });

    it("Partial liquidation open", async function () {
      await setMinterDebtDeposit(
        BigNumber.from(10).mul(unit),
        BigNumber.from(1400).mul(unit),
        BigNumber.from(100).mul(unit)
      );
      await synth.mintWithETH(liquidatorAddress, BigNumber.from(3).mul(unit));
      await synth
        .connect(liquidatorSigner)
        .approve(ownerAddress, BigNumber.from(3).mul(unit));
      // Note that callStatic does not change the EVM state. So we need to call this again without callStatic.
      const [totalRedeemed, amountToLiquidate] =
        await synth.callStatic.liquidateDelinquentAccount(
          minterAddress,
          BigNumber.from(3).mul(unit),
          liquidatorAddress
        );
      expect(totalRedeemed).to.equal(BigNumber.from(360).mul(unit));
      expect(amountToLiquidate).to.equal(BigNumber.from(3).mul(unit));

      await synth.liquidateDelinquentAccount(
        minterAddress,
        BigNumber.from(3).mul(unit),
        liquidatorAddress
      );
      expect(await reserve.getMinterDebtETH(minterAddress)).to.equal(
        BigNumber.from(7).mul(unit)
      );
      expect(await reserve.getMinterDepositETH(minterAddress)).to.equal(
        BigNumber.from(1040).mul(unit)
      );
      expect(await reserve.isOpenForLiquidation(minterAddress)).to.equal(true);
      expect(await synth.balanceOf(liquidatorAddress)).to.equal(
        BigNumber.from(0).mul(unit)
      );
    });

    it("Partial liquidation closed", async function () {
      await setMinterDebtDeposit(
        BigNumber.from(20).mul(unit),
        BigNumber.from(2700).mul(unit),
        BigNumber.from(100).mul(unit)
      );
      await synth.mintWithETH(liquidatorAddress, BigNumber.from(12).mul(unit));
      await synth
        .connect(liquidatorSigner)
        .approve(ownerAddress, BigNumber.from(11).mul(unit));
      // Note that callStatic does not change the EVM state. So we need to call this again without callStatic.
      const [totalRedeemed, amountToLiquidate] =
        await synth.callStatic.liquidateDelinquentAccount(
          minterAddress,
          BigNumber.from(11).mul(unit),
          liquidatorAddress
        );
      expect(totalRedeemed).to.equal(BigNumber.from(1320).mul(unit));
      expect(amountToLiquidate).to.equal(BigNumber.from(11).mul(unit));

      await synth.liquidateDelinquentAccount(
        minterAddress,
        BigNumber.from(11).mul(unit),
        liquidatorAddress
      );
      expect(await reserve.getMinterDebtETH(minterAddress)).to.equal(
        BigNumber.from(9).mul(unit)
      );
      expect(await reserve.getMinterDepositETH(minterAddress)).to.equal(
        BigNumber.from(1380).mul(unit)
      );
      expect(await reserve.isOpenForLiquidation(minterAddress)).to.equal(false);
      expect(await synth.balanceOf(liquidatorAddress)).to.equal(
        BigNumber.from(1).mul(unit)
      );
    });

    it("Full liquidation", async function () {
      await setMinterDebtDeposit(
        BigNumber.from(10).mul(unit),
        BigNumber.from(1150).mul(unit),
        BigNumber.from(100).mul(unit)
      );
      await synth.mintWithETH(liquidatorAddress, BigNumber.from(12).mul(unit));
      await synth
        .connect(liquidatorSigner)
        .approve(ownerAddress, BigNumber.from(11).mul(unit));
      // Note that callStatic does not change the EVM state. So we need to call this again without callStatic.
      const [totalRedeemed, amountToLiquidate] =
        await synth.callStatic.liquidateDelinquentAccount(
          minterAddress,
          BigNumber.from(11).mul(unit),
          liquidatorAddress
        );
      expect(totalRedeemed).to.equal(BigNumber.from(1150).mul(unit));
      expect(amountToLiquidate).to.equal(BigNumber.from(10).mul(unit));

      await synth.liquidateDelinquentAccount(
        minterAddress,
        BigNumber.from(11).mul(unit),
        liquidatorAddress
      );
      expect(await reserve.getMinterDebtETH(minterAddress)).to.equal(
        BigNumber.from(0).mul(unit)
      );
      expect(await reserve.getMinterDepositETH(minterAddress)).to.equal(
        BigNumber.from(0).mul(unit)
      );
      expect(await reserve.isOpenForLiquidation(minterAddress)).to.equal(false);
      expect(await synth.balanceOf(liquidatorAddress)).to.equal(
        BigNumber.from(2).mul(unit)
      );
    });

    it("Full liquidation remain", async function () {
      await setMinterDebtDeposit(
        BigNumber.from(10).mul(unit),
        BigNumber.from(1300).mul(unit),
        BigNumber.from(100).mul(unit)
      );
      await synth.mintWithETH(liquidatorAddress, BigNumber.from(12).mul(unit));
      await synth
        .connect(liquidatorSigner)
        .approve(ownerAddress, BigNumber.from(11).mul(unit));
      // Note that callStatic does not change the EVM state. So we need to call this again without callStatic.
      const [totalRedeemed, amountToLiquidate] =
        await synth.callStatic.liquidateDelinquentAccount(
          minterAddress,
          BigNumber.from(11).mul(unit),
          liquidatorAddress
        );
      expect(totalRedeemed).to.equal(BigNumber.from(1200).mul(unit));
      expect(amountToLiquidate).to.equal(BigNumber.from(10).mul(unit));

      await synth.liquidateDelinquentAccount(
        minterAddress,
        BigNumber.from(11).mul(unit),
        liquidatorAddress
      );
      expect(await reserve.getMinterDebtETH(minterAddress)).to.equal(
        BigNumber.from(0).mul(unit)
      );
      expect(await reserve.getMinterDepositETH(minterAddress)).to.equal(
        BigNumber.from(100).mul(unit)
      );
      expect(await reserve.isOpenForLiquidation(minterAddress)).to.equal(false);
      expect(await synth.balanceOf(liquidatorAddress)).to.equal(
        BigNumber.from(2).mul(unit)
      );
    });
  });
});
