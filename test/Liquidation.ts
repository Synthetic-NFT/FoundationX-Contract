import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Liquidation, Reserve, SafeDecimalMath } from "../typechain";
import { beforeEach, it } from "mocha";
import { BigNumber } from "ethers";

describe("#Liquidation", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let liquidation: Liquidation;
  let unit: BigNumber;

  beforeEach(async function () {
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    unit = await librarySafeDecimalMath.UNIT();
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
  };

  it("Set and unset liquidation", async function () {
    const liquidationPenalty = BigNumber.from(125).mul(unit).div(100);
    const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
    await setUp(liquidationPenalty, minCollateralRatio);

    const [_, signer] = await ethers.getSigners();
    const signerAddress = signer.address;
    await reserve.addMinterDebt(signerAddress, BigNumber.from(1).mul(unit));
    expect(await liquidation.isOpenForLiquidation(signerAddress)).to.equal(
      false
    );
    await liquidation.flagAccountForLiquidation(signerAddress);
    expect(await liquidation.isOpenForLiquidation(signerAddress)).to.equal(
      true
    );
    await liquidation.removeAccountInLiquidation(signerAddress);
    expect(await liquidation.isOpenForLiquidation(signerAddress)).to.equal(
      false
    );
  });

  describe("Check and remove account in liquidation", function () {
    let signerAddress: string;

    beforeEach(async function () {
      const liquidationPenalty = BigNumber.from(110).mul(unit).div(100);
      const minCollateralRatio = BigNumber.from(125).mul(unit).div(100);
      await setUp(liquidationPenalty, minCollateralRatio);
      const [_, signer] = await ethers.getSigners();
      signerAddress = signer.address;
    });

    const body = async function (
      deposit: BigNumber,
      debt: BigNumber,
      assetPrice: BigNumber,
      openForLiquidation: boolean
    ) {
      await Promise.all([
        reserve.addMinterDeposit(signerAddress, deposit),
        reserve.addMinterDebt(signerAddress, debt),
      ]);
      await liquidation.flagAccountForLiquidation(signerAddress);
      await liquidation.checkAndRemoveAccountInLiquidation(
        signerAddress,
        assetPrice
      );
      expect(await liquidation.isOpenForLiquidation(signerAddress)).to.equal(
        openForLiquidation
      );
    };

    it("removed", async function () {
      await body(
        BigNumber.from(130).mul(unit),
        BigNumber.from(1).mul(unit),
        BigNumber.from(100).mul(unit),
        false
      );
    });

    it("not removed", async function () {
      await body(
        BigNumber.from(120).mul(unit),
        BigNumber.from(1).mul(unit),
        BigNumber.from(100).mul(unit),
        true
      );
    });
  });

  it("Calculate amount to fix collateral ratio", async function () {
    const liquidationPenalty = BigNumber.from(120).mul(unit).div(100);
    const minCollateralRatio = BigNumber.from(160).mul(unit).div(100);
    await setUp(liquidationPenalty, minCollateralRatio);

    const collateral = BigNumber.from(300).mul(unit);
    const debtBalance = BigNumber.from(200).mul(unit);
    expect(
      await liquidation.calculateAmountToFixCollateral(debtBalance, collateral)
    ).to.equal(BigNumber.from(50).mul(unit));
  });
});
