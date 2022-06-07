import { expect } from "chai";
import { ethers } from "hardhat";
import { Reserve, SafeDecimalMath } from "../typechain";
import { beforeEach, it } from "mocha";
import { BigNumber } from "ethers";
import { deployReserve, deploySafeDecimalMath } from "./shared/constructor";
import { createReadStream } from "fs";

describe("#Reserve", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let unit: BigNumber;
  let decimal: number;

  beforeEach(async function () {
    librarySafeDecimalMath = await deploySafeDecimalMath();
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

  it("Get active addresses", async function () {
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
    expect(await reserve.getActiveAddresses()).to.deep.equal([signerAddress]);

    await reserve.reduceMinterDebtETH(
      signerAddress,
      BigNumber.from(1).mul(unit)
    );
    expect(await reserve.getActiveAddresses()).to.deep.equal([]);
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

  it("Get reserve info", async function () {
    const [owner, minter0, minter1, minter2, minter3, minter4] =
      await ethers.getSigners();
    await setUp(
      ethers.utils.parseUnits("1.5", decimal),
      ethers.utils.parseUnits("1.2", decimal)
    );
    await reserve.connect(owner).setPageSize(3);
    const minterDebt0 = BigNumber.from(2).mul(unit);
    const minterDebt1 = BigNumber.from(3).mul(unit);
    const minterDebt2 = BigNumber.from(4).mul(unit);
    const minterDebt3 = BigNumber.from(5).mul(unit);
    const minterDebt4 = BigNumber.from(6).mul(unit);
    const minterInfos: Array<[string, BigNumber, BigNumber]> = [
      [minter0.address, minterDebt0, BigNumber.from(400).mul(unit)],
      [minter1.address, minterDebt1, BigNumber.from(750).mul(unit)],
      [minter2.address, minterDebt2, BigNumber.from(1200).mul(unit)],
      [minter3.address, minterDebt3, BigNumber.from(1750).mul(unit)],
      [minter4.address, minterDebt4, BigNumber.from(2400).mul(unit)],
    ];
    for (const minterInfo of minterInfos) {
      await Promise.all([
        reserve.addMinterDebtETH(minterInfo[0], minterInfo[1]),
        reserve.addMinterDepositETH(minterInfo[0], minterInfo[2]),
      ]);
    }

    expect(await reserve.getNumPages()).to.equal(BigNumber.from(2));
    expect(
      await reserve.getUserReserveInfo(
        BigNumber.from(0),
        BigNumber.from(100).mul(unit)
      )
    ).to.eql([
      [minter0.address, minter1.address, minter2.address],
      [minterDebt0, minterDebt1, minterDebt2],
      [
        ethers.utils.parseUnits("2.0", decimal),
        ethers.utils.parseUnits("2.5", decimal),
        ethers.utils.parseUnits("3.0", decimal),
      ],
    ]);
    expect(
      await reserve.getUserReserveInfo(
        BigNumber.from(1),
        BigNumber.from(100).mul(unit)
      )
    ).to.eql([
      [minter3.address, minter4.address],
      [minterDebt3, minterDebt4],
      [
        ethers.utils.parseUnits("3.5", decimal),
        ethers.utils.parseUnits("4.0", decimal),
      ],
    ]);
  });
});
