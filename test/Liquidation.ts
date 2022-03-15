import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {generateRandomAddress} from "./shared/address";
import {Liquidation, SafeDecimalMath} from "../typechain";
import {beforeEach} from "mocha";
import {closeBigNumber} from "./shared/math";

const { BigNumber } = ethers;

describe("Liquidation", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let liquidation: Liquidation;

  beforeEach(async function () {
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    const Liquidation = await ethers.getContractFactory("Liquidation", {
      libraries: {
        SafeDecimalMath: librarySafeDecimalMath.address,
      },
    });
    liquidation = await Liquidation.deploy();
  });

  it("Set and unset liquidation", async function () {
    const randomAddress1 = generateRandomAddress();
    expect(await liquidation.isOpenForLiquidation(randomAddress1)).to.equal(
      false
    );
    const flagLiquidationTx = await liquidation.flagAccountForLiquidation(
      randomAddress1
    );
    await flagLiquidationTx.wait();
    expect(await liquidation.isOpenForLiquidation(randomAddress1)).to.equal(
      true
    );
    const removeLiquidationTx = await liquidation.removeAccountInLiquidation(
      randomAddress1
    );
    await removeLiquidationTx.wait();
    expect(await liquidation.isOpenForLiquidation(randomAddress1)).to.equal(
      false
    );
  });

  it("Calculate amount to fix collateral ratio", async function () {
    const unit = await librarySafeDecimalMath.UNIT();
    const liquidationPenalty = BigNumber.from(25).mul(unit).div(100);
    const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
    const Liquidation = await ethers.getContractFactory("Liquidation", {
      libraries: {
        SafeDecimalMath: librarySafeDecimalMath.address,
      },
    });
    liquidation = (await upgrades.deployProxy(
      Liquidation,
      [liquidationPenalty, minCollateralRatio],
      { unsafeAllowLinkedLibraries: true }
    )) as Liquidation;

    const collateral = BigNumber.from(300).mul(unit);
    const debtBalance = BigNumber.from(250).mul(unit);
    const precision = 4;
    const amountToFix = await liquidation.calculateAmountToFixCollateral(
      debtBalance,
      collateral
    );
    const expectAmoutToFix = BigNumber.from(2285714)
      .mul(unit)
      .div(Math.pow(10, precision));
    expect(
      closeBigNumber(
        amountToFix,
        expectAmoutToFix,
        BigNumber.from(1).mul(unit).div(Math.pow(10, precision))
      )
    ).to.equal(true);
  });
});
