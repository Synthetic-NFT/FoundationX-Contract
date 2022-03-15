import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { generateRandomAddress } from "./shared/address";
import { Liquidation, MockOralce, SafeDecimalMath, Synth } from "../typechain";
import { beforeEach, describe, it } from "mocha";

import { BigNumber } from "ethers";

describe("Synth", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
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

    const MockOracle = await ethers.getContractFactory("MockOralce");
    oracle = await MockOracle.deploy();

    const Synth = await ethers.getContractFactory("Synth", {
      libraries: {
        SafeDecimalMath: librarySafeDecimalMath.address,
      },
    });
    synth = (await upgrades.deployProxy(
      Synth,
      [liquidation.address, oracle.address, "CryptoPunks", "$PUNK"],
      { unsafeAllowLinkedLibraries: true }
    )) as Synth;
  };

  it("Mint burn Synth", async function () {
    const liquidationPenalty = BigNumber.from(25).mul(unit).div(100);
    const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
    await setUp(liquidationPenalty, minCollateralRatio);

    const randomAddress1 = generateRandomAddress();
    const randomAddress2 = generateRandomAddress();

    await synth.mintSynth(randomAddress1, BigNumber.from(10).mul(unit));
    await synth.mintSynth(randomAddress2, BigNumber.from(20).mul(unit));

    const assertBalance = async function (address: string, balance: BigNumber) {
      expect(await synth.getMinterDebt(address)).to.equal(balance);
      expect(await synth.balanceOf(address)).to.equal(balance);
    };

    await assertBalance(randomAddress1, BigNumber.from(10).mul(unit));
    await assertBalance(randomAddress2, BigNumber.from(20).mul(unit));
    expect(await synth.totalSupply()).to.equal(BigNumber.from(30).mul(unit));

    await synth.burnSynth(
      randomAddress1,
      randomAddress1,
      BigNumber.from(5).mul(unit)
    );
    await synth.burnSynth(
      randomAddress2,
      randomAddress2,
      BigNumber.from(25).mul(unit)
    );
    await assertBalance(randomAddress1, BigNumber.from(5).mul(unit));
    await assertBalance(randomAddress2, BigNumber.from(0).mul(unit));
    expect(await synth.totalSupply()).to.equal(BigNumber.from(5).mul(unit));
  });

  it("Liquidate delinquent account", async function () {});
});
