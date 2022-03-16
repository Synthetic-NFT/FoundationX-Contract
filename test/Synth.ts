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

describe("Synth", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let liquidation: Liquidation;
  let oracle: MockOralce;
  let synth: Synth;
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

    const MockOracle = await ethers.getContractFactory("MockOralce");
    oracle = await MockOracle.deploy();

    const Synth = await ethers.getContractFactory("Synth", {
      libraries: {
        SafeDecimalMath: librarySafeDecimalMath.address,
      },
    });
    synth = (await upgrades.deployProxy(
      Synth,
      [
        reserve.address,
        liquidation.address,
        oracle.address,
        "CryptoPunks",
        "$PUNK",
      ],
      { unsafeAllowLinkedLibraries: true }
    )) as Synth;

    await reserve.grantRole(await reserve.MINTER_ROLE(), synth.address);
  };

  it("Mint burn Synth", async function () {
    const liquidationPenalty = BigNumber.from(25).mul(unit).div(100);
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

  it("Liquidate delinquent account", async function () {
    const liquidationPenalty = BigNumber.from(25).mul(unit).div(100);
    const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
    await setUp(liquidationPenalty, minCollateralRatio);

    const [owner, signer1, signer2] = await ethers.getSigners();
  });
});
