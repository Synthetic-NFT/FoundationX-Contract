import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  Liquidation,
  MockOralce,
  Reserve,
  SafeDecimalMath,
  Synth,
} from "../typechain";
import { beforeEach, describe, it } from "mocha";

import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("#Synth", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let liquidation: Liquidation;
  let oracle: MockOralce;
  let synth: Synth;
  let unit: BigNumber;
  const tokenName = "CryptoPunks";
  const tokenSymbol = "$PUNK";

  beforeEach(async function () {
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    unit = await librarySafeDecimalMath.UNIT();
    const MockOracle = await ethers.getContractFactory("MockOralce");
    oracle = await MockOracle.deploy();
  });

  const setUp = async function (
    liquidationPenalty: BigNumber,
    minCollateralRatio: BigNumber
  ) {
    const Reserve = await ethers.getContractFactory("Reserve");
    reserve = (await upgrades.deployProxy(Reserve, [
      minCollateralRatio,
    ])) as Reserve;

    const Liquidation = await ethers.getContractFactory("Liquidation", {
      libraries: {
        SafeDecimalMath: librarySafeDecimalMath.address,
      },
    });
    liquidation = (await upgrades.deployProxy(
      Liquidation,
      [reserve.address, liquidationPenalty],
      { unsafeAllowLinkedLibraries: true }
    )) as Liquidation;

    const Synth = await ethers.getContractFactory("Synth");
    synth = (await upgrades.deployProxy(Synth, [
      reserve.address,
      liquidation.address,
      oracle.address,
      tokenName,
      tokenSymbol,
    ])) as Synth;

    await reserve.grantRole(await reserve.MINTER_ROLE(), synth.address);
  };

  it("Mint burn Synth", async function () {
    const liquidationPenalty = BigNumber.from(125).mul(unit).div(100);
    const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
    await setUp(liquidationPenalty, minCollateralRatio);

    const [owner, signer1, signer2] = await ethers.getSigners();

    await synth.mintSynth(signer1.address, BigNumber.from(10).mul(unit));
    await synth.mintSynth(signer2.address, BigNumber.from(20).mul(unit));

    const assertBalance = async function (address: string, balance: BigNumber) {
      expect(await reserve.getMinterDebt(address)).to.equal(balance);
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
    await synth.burnSynth(
      signer1.address,
      signer1.address,
      BigNumber.from(5).mul(unit)
    );
    await synth.burnSynth(
      signer2.address,
      signer2.address,
      BigNumber.from(25).mul(unit)
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
      const liquidationPenalty = BigNumber.from(120).mul(unit).div(100);
      const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
      await setUp(liquidationPenalty, minCollateralRatio);

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
        reserve.addMinterDebt(minterAddress, debt),
        reserve.addMinterDeposit(minterAddress, deposit),
        oracle.setAssetPrice(tokenName, assetPrice),
      ]);
      await liquidation.flagAccountForLiquidation(minterAddress);
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
      await synth.mintSynth(liquidatorAddress, BigNumber.from(5).mul(unit));
      await expect(
        synth.liquidateDelinquentAccount(
          minterAddress,
          BigNumber.from(6).mul(unit),
          liquidatorAddress
        )
      ).to.be.revertedWith(await synth.ERR_LIQUIDATE_NOT_ENOUGH_SYNTH());
    });

    it("Partial liquidation", async function () {
      await setMinterDebtDeposit(
        BigNumber.from(10).mul(unit),
        BigNumber.from(1400).mul(unit),
        BigNumber.from(100).mul(unit)
      );
      await synth.mintSynth(liquidatorAddress, BigNumber.from(6).mul(unit));
      await synth
        .connect(liquidatorSigner)
        .approve(ownerAddress, BigNumber.from(5).mul(unit));
      // Note that callStatic does not change the EVM state. So we need to call this again without callStatic.
      const [totalRedeemed, amountToLiquidate] =
        await synth.callStatic.liquidateDelinquentAccount(
          minterAddress,
          BigNumber.from(5).mul(unit),
          liquidatorAddress
        );
      expect(totalRedeemed).to.be.equal(BigNumber.from(600).mul(unit));
      expect(amountToLiquidate).to.be.equal(BigNumber.from(500).mul(unit));

      await synth.liquidateDelinquentAccount(
        minterAddress,
        BigNumber.from(5).mul(unit),
        liquidatorAddress
      );
      expect(await reserve.getMinterDebt(minterAddress)).to.equal(
        BigNumber.from(5).mul(unit)
      );
      expect(await reserve.getMinterDeposit(minterAddress)).to.equal(
        BigNumber.from(800).mul(unit)
      );
      expect(await synth.balanceOf(liquidatorAddress)).to.equal(
        BigNumber.from(1).mul(unit)
      );
    });

    it("Full liquidation", async function () {});
  });
});
