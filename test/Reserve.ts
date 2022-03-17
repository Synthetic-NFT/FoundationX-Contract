import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Reserve, SafeDecimalMath } from "../typechain";
import { beforeEach, it } from "mocha";
import { BigNumber } from "ethers";

describe("#Reserve", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let unit: BigNumber;

  beforeEach(async function () {
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    unit = await librarySafeDecimalMath.UNIT();
  });

  const setUp = async function (minCollateralRatio: BigNumber) {
    const Reserve = await ethers.getContractFactory("Reserve");
    reserve = (await upgrades.deployProxy(Reserve, [
      minCollateralRatio,
    ])) as Reserve;
  };

  it("Minter collateral ratio", async function () {
    const minCollateralRatio = BigNumber.from(125).mul(unit).div(100);
    await setUp(minCollateralRatio);
    const [_, signer] = await ethers.getSigners();
    const signerAddress = signer.address;
    await Promise.all([
      reserve.addMinterDeposit(signerAddress, BigNumber.from(130).mul(unit)),
      reserve.addMinterDebt(signerAddress, BigNumber.from(1).mul(unit)),
    ]);
    expect(
      await reserve.getMinterCollateralRatio(
        signerAddress,
        BigNumber.from(100).mul(unit)
      )
    ).to.equal(BigNumber.from(13).mul(unit).div(10));
  });
});
