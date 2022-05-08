import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Reserve, SafeDecimalMath } from "../typechain";
import { beforeEach, it } from "mocha";
import { BigNumber } from "ethers";
import { deployReserve } from "./shared/constructor";

describe("#Reserve", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let unit: BigNumber;
  let decimal: number;

  beforeEach(async function () {
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    decimal = await librarySafeDecimalMath.decimals();
    unit = await librarySafeDecimalMath.UNIT();
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
  };

  it("Minter collateral ratio", async function () {
    await setUp(
      ethers.utils.parseUnits("1.25", decimal),
      ethers.utils.parseUnits("1.1", decimal)
    );
    const [_, signer] = await ethers.getSigners();
    const signerAddress = signer.address;
    await Promise.all([
      reserve.addMinterDepositETH(signerAddress, BigNumber.from(130).mul(unit)),
      reserve.addMinterDebtETH(signerAddress, BigNumber.from(1).mul(unit)),
    ]);
    expect(
      await reserve.getMinterCollateralRatio(
        signerAddress,
        BigNumber.from(100).mul(unit)
      )
    ).to.equal(ethers.utils.parseUnits("1.3", decimal));
  });

  it("Set and unset liquidation", async function () {
    await setUp(
      ethers.utils.parseUnits("1.5", decimal),
      ethers.utils.parseUnits("1.25", decimal)
    );

    const [_, signer] = await ethers.getSigners();
    const signerAddress = signer.address;
    await reserve.addMinterDebtETH(signerAddress, BigNumber.from(1).mul(unit));
    expect(await reserve.isOpenForLiquidation(signerAddress)).to.equal(false);
    await reserve.flagAccountForLiquidation(signerAddress);
    expect(await reserve.isOpenForLiquidation(signerAddress)).to.equal(true);
    await reserve.removeAccountInLiquidation(signerAddress);
    expect(await reserve.isOpenForLiquidation(signerAddress)).to.equal(false);
  });

  describe("Check and remove account in liquidation", function () {
    let signerAddress: string;

    beforeEach(async function () {
      await setUp(
        ethers.utils.parseUnits("1.25", decimal),
        ethers.utils.parseUnits("1.1", decimal)
      );
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
        reserve.addMinterDepositETH(signerAddress, deposit),
        reserve.addMinterDebtETH(signerAddress, debt),
      ]);
      await reserve.flagAccountForLiquidation(signerAddress);
      await reserve.checkAndRemoveAccountInLiquidation(
        signerAddress,
        assetPrice
      );
      expect(await reserve.isOpenForLiquidation(signerAddress)).to.equal(
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
    await setUp(
      ethers.utils.parseUnits("1.6", decimal),
      ethers.utils.parseUnits("1.2", decimal)
    );

    const collateral = BigNumber.from(300).mul(unit);
    const debtBalance = BigNumber.from(200).mul(unit);
    expect(
      await reserve.calculateAmountToFixCollateral(debtBalance, collateral)
    ).to.equal(BigNumber.from(50).mul(unit));
  });
});
