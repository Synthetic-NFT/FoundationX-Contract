import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MockOracle, Reserve, SafeDecimalMath, Synth } from "../typechain";
import { beforeEach, describe, it } from "mocha";

import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    decimal = await librarySafeDecimalMath.decimals();
    unit = await librarySafeDecimalMath.UNIT();
    const MockOracle = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracle.deploy();
  });

  const setUp = async function (
    liquidationPenalty: BigNumber,
    minCollateralRatio: BigNumber
  ) {
    const Reserve = await ethers.getContractFactory("Reserve", {
      libraries: {
        SafeDecimalMath: librarySafeDecimalMath.address,
      },
    });
    reserve = (await upgrades.deployProxy(
      Reserve,
      [minCollateralRatio, liquidationPenalty],
      { unsafeAllowLinkedLibraries: true }
    )) as Reserve;

    const Synth = await ethers.getContractFactory("Synth");
    synth = (await upgrades.deployProxy(Synth, [
      reserve.address,
      oracle.address,
      tokenName,
      tokenSymbol,
    ])) as Synth;

    await reserve.grantRole(await reserve.DEFAULT_ADMIN_ROLE(), synth.address);
    await reserve.grantRole(await reserve.MINTER_ROLE(), synth.address);
  };

  it("Mint burn Synth", async function () {
    await setUp(
      ethers.utils.parseUnits("1.25", decimal),
      ethers.utils.parseUnits("1.5", decimal)
    );

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
      await setUp(
        ethers.utils.parseUnits("1.2", decimal),
        ethers.utils.parseUnits("1.5", decimal)
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
        reserve.addMinterDebt(minterAddress, debt),
        reserve.addMinterDeposit(minterAddress, deposit),
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
      await synth.mintSynth(liquidatorAddress, BigNumber.from(5).mul(unit));
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
      await synth.mintSynth(liquidatorAddress, BigNumber.from(3).mul(unit));
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
      expect(totalRedeemed).to.be.equal(BigNumber.from(360).mul(unit));
      expect(amountToLiquidate).to.be.equal(BigNumber.from(300).mul(unit));

      await synth.liquidateDelinquentAccount(
        minterAddress,
        BigNumber.from(3).mul(unit),
        liquidatorAddress
      );
      expect(await reserve.getMinterDebt(minterAddress)).to.equal(
        BigNumber.from(7).mul(unit)
      );
      expect(await reserve.getMinterDeposit(minterAddress)).to.equal(
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
      await synth.mintSynth(liquidatorAddress, BigNumber.from(12).mul(unit));
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
      expect(totalRedeemed).to.be.equal(BigNumber.from(1200).mul(unit));
      expect(amountToLiquidate).to.be.equal(BigNumber.from(1000).mul(unit));

      await synth.liquidateDelinquentAccount(
        minterAddress,
        BigNumber.from(11).mul(unit),
        liquidatorAddress
      );
      expect(await reserve.getMinterDebt(minterAddress)).to.equal(
        BigNumber.from(10).mul(unit)
      );
      expect(await reserve.getMinterDeposit(minterAddress)).to.equal(
        BigNumber.from(1500).mul(unit)
      );
      expect(await reserve.isOpenForLiquidation(minterAddress)).to.equal(false);
      expect(await synth.balanceOf(liquidatorAddress)).to.equal(
        BigNumber.from(2).mul(unit)
      );
    });

    it("Full liquidation", async function () {
      await setMinterDebtDeposit(
        BigNumber.from(10).mul(unit),
        BigNumber.from(1150).mul(unit),
        BigNumber.from(100).mul(unit)
      );
      await synth.mintSynth(liquidatorAddress, BigNumber.from(12).mul(unit));
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
      expect(totalRedeemed).to.be.equal(BigNumber.from(1150).mul(unit));
      expect(amountToLiquidate).to.be.equal(BigNumber.from(1000).mul(unit));

      await synth.liquidateDelinquentAccount(
        minterAddress,
        BigNumber.from(11).mul(unit),
        liquidatorAddress
      );
      expect(await reserve.getMinterDebt(minterAddress)).to.equal(
        BigNumber.from(0).mul(unit)
      );
      expect(await reserve.getMinterDeposit(minterAddress)).to.equal(
        BigNumber.from(0).mul(unit)
      );
      expect(await reserve.isOpenForLiquidation(minterAddress)).to.equal(false);
      expect(await synth.balanceOf(liquidatorAddress)).to.equal(
        BigNumber.from(2).mul(unit)
      );
    });
  });
});
