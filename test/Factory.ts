import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  Factory,
  Liquidation,
  MockOralce,
  Reserve,
  SafeDecimalMath,
  Synth,
} from "../typechain";
import { beforeEach, describe, it } from "mocha";
import { BigNumber } from "ethers";
import { getEthBalance } from "./shared/address";
import { closeBigNumber } from "./shared/math";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("#Factory", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let liquidation: Liquidation;
  let oracle: MockOralce;
  let synth: Synth;
  let factory: Factory;
  let decimal: number;
  let unit: BigNumber;
  const tokenName = "CryptoPunks";
  const tokenSymbol = "$PUNK";

  beforeEach(async function () {
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    decimal = await librarySafeDecimalMath.decimals();
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

    const Factory = await ethers.getContractFactory("Factory");
    factory = (await upgrades.deployProxy(Factory, [])) as Factory;
    await factory.listSynth(tokenName, synth.address, reserve.address);

    await reserve.grantRole(await reserve.MINTER_ROLE(), factory.address);
    await reserve.grantRole(await reserve.MINTER_ROLE(), synth.address);
    await synth.grantRole(await synth.MINTER_ROLE(), factory.address);
    await liquidation.grantRole(
      await liquidation.DEFAULT_ADMIN_ROLE(),
      synth.address
    );
  };

  const setUpUserAccount = async function (
    signer: SignerWithAddress,
    initialBalance: BigNumber
  ) {
    await network.provider.send("hardhat_setBalance", [
      signer.address,
      initialBalance.toHexString(),
    ]);
  };

  describe("User mint synth", async function () {
    let minter: SignerWithAddress;
    let minterAddress: string;

    beforeEach(async function () {
      const liquidationPenalty = ethers.utils.parseUnits("1.2", decimal);
      const minCollateralRatio = ethers.utils.parseUnits("1.5", decimal);
      await setUp(liquidationPenalty, minCollateralRatio);
      const [_, minterSigner] = await ethers.getSigners();
      minter = minterSigner;
      minterAddress = minter.address;
      await Promise.all([
        setUpUserAccount(minter, BigNumber.from(400).mul(unit)),
        oracle.setAssetPrice(tokenName, BigNumber.from(10).mul(unit)),
      ]);
    });

    it("Invalid", async function () {
      await expect(
        factory
          .connect(minter)
          .userMintSynth(tokenName, ethers.utils.parseUnits("1.4", decimal), {
            value: BigNumber.from(200).mul(unit),
          })
      ).to.be.revertedWith(await factory.ERR_INVALID_TARGET_COLLATERAL_RATIO());
    });

    it("Valid", async function () {
      await factory
        .connect(minter)
        .userMintSynth(tokenName, ethers.utils.parseUnits("1.6", decimal), {
          value: BigNumber.from(320).mul(unit),
        });
      const minterDebt = BigNumber.from(20).mul(unit);
      const minterDeposit = BigNumber.from(320).mul(unit);
      expect(await getEthBalance(factory.address)).to.equal(minterDeposit);
      expect(await synth.balanceOf(minterAddress)).to.equal(minterDebt);
      expect(await reserve.getMinterDebt(minterAddress)).to.equal(minterDebt);
      expect(await reserve.getMinterDeposit(minterAddress)).to.equal(
        minterDeposit
      );
    });
  });

  it("User burn synth", async function () {
    const liquidationPenalty = ethers.utils.parseUnits("1.2", decimal);
    const minCollateralRatio = ethers.utils.parseUnits("1.5", decimal);
    await setUp(liquidationPenalty, minCollateralRatio);
    const [_, minter] = await ethers.getSigners();
    const minterAddress = minter.address;

    await Promise.all([
      setUpUserAccount(minter, BigNumber.from(400).mul(unit)),
      oracle.setAssetPrice(tokenName, BigNumber.from(10).mul(unit)),
    ]);
    await factory
      .connect(minter)
      .userMintSynth(tokenName, ethers.utils.parseUnits("1.6", decimal), {
        value: BigNumber.from(320).mul(unit),
      });
    await synth
      .connect(minter)
      .approve(factory.address, BigNumber.from(20).mul(unit));
    await factory.connect(minter).userBurnSynth(tokenName);

    expect(await getEthBalance(factory.address)).to.equal(
      BigNumber.from(0).mul(unit)
    );
    expect(await synth.balanceOf(minterAddress)).to.equal(
      BigNumber.from(0).mul(unit)
    );
    expect(await reserve.getMinterDebt(minterAddress)).to.equal(
      BigNumber.from(0).mul(unit)
    );
    expect(await reserve.getMinterDeposit(minterAddress)).to.equal(
      BigNumber.from(0).mul(unit)
    );
    const minterEthBalance = await getEthBalance(minterAddress);
    expect(
      closeBigNumber(
        minterEthBalance,
        BigNumber.from(400).mul(unit),
        BigNumber.from(1).mul(unit)
      )
    ).to.true;
  });

  describe("User manage synth", async function () {
    let minter: SignerWithAddress;
    let minterAddress: string;

    beforeEach(async function () {
      const liquidationPenalty = ethers.utils.parseUnits("1.2", decimal);
      const minCollateralRatio = ethers.utils.parseUnits("1.5", decimal);
      await setUp(liquidationPenalty, minCollateralRatio);
      const [_, minterSigner] = await ethers.getSigners();
      minter = minterSigner;
      minterAddress = minter.address;
      await Promise.all([
        setUpUserAccount(minter, BigNumber.from(400).mul(unit)),
        oracle.setAssetPrice(tokenName, BigNumber.from(10).mul(unit)),
      ]);
    });

    const assertFactoryState = async function (
      minterBalance: BigNumber,
      factoryBalance: BigNumber,
      minterDeposit: BigNumber,
      minterDebt: BigNumber
    ) {
      expect(await getEthBalance(factory.address)).to.equal(factoryBalance);
      expect(await synth.balanceOf(minterAddress)).to.equal(minterDebt);
      expect(await reserve.getMinterDebt(minterAddress)).to.equal(minterDebt);
      expect(await reserve.getMinterDeposit(minterAddress)).to.equal(
        minterDeposit
      );
      expect(
        closeBigNumber(
          minterDeposit,
          await getEthBalance(minterAddress),
          BigNumber.from(1).mul(unit.sub(4))
        )
      );
    };

    it("Add deposit add debt", async function () {
      await factory
        .connect(minter)
        .userMintSynth(tokenName, ethers.utils.parseUnits("1.6", decimal), {
          value: BigNumber.from(160).mul(unit),
        });
      await factory
        .connect(minter)
        .userManageSynth(
          tokenName,
          ethers.utils.parseUnits("1.7", decimal),
          BigNumber.from(340).mul(unit),
          { value: BigNumber.from(180).mul(unit) }
        );
      const minterBalance = BigNumber.from(60).mul(unit);
      const minterDebt = BigNumber.from(20).mul(unit);
      const minterDeposit = BigNumber.from(340).mul(unit);
      await assertFactoryState(
        minterBalance,
        minterDeposit,
        minterDeposit,
        minterDebt
      );
    });

    it("Add deposit reduce debt", async function () {
      await factory
        .connect(minter)
        .userMintSynth(tokenName, ethers.utils.parseUnits("1.6", decimal), {
          value: BigNumber.from(160).mul(unit),
        });
      await synth
        .connect(minter)
        .approve(factory.address, BigNumber.from(1).mul(unit));
      await factory
        .connect(minter)
        .userManageSynth(
          tokenName,
          ethers.utils.parseUnits("2.0", decimal),
          BigNumber.from(180).mul(unit),
          { value: BigNumber.from(20).mul(unit) }
        );
      const minterBalance = BigNumber.from(220).mul(unit);
      const minterDebt = BigNumber.from(9).mul(unit);
      const minterDeposit = BigNumber.from(180).mul(unit);
      await assertFactoryState(
        minterBalance,
        minterDeposit,
        minterDeposit,
        minterDebt
      );
    });

    it("Reduce deposit add debt", async function () {
      await factory
        .connect(minter)
        .userMintSynth(tokenName, ethers.utils.parseUnits("2.0", decimal), {
          value: BigNumber.from(180).mul(unit),
        });
      await factory
        .connect(minter)
        .userManageSynth(
          tokenName,
          ethers.utils.parseUnits("1.6", decimal),
          BigNumber.from(160).mul(unit)
        );
      const minterBalance = BigNumber.from(240).mul(unit);
      const minterDebt = BigNumber.from(10).mul(unit);
      const minterDeposit = BigNumber.from(160).mul(unit);
      await assertFactoryState(
        minterBalance,
        minterDeposit,
        minterDeposit,
        minterDebt
      );
    });

    it("Reduce deposit reduce debt", async function () {
      await factory
        .connect(minter)
        .userMintSynth(tokenName, ethers.utils.parseUnits("2.0", decimal), {
          value: BigNumber.from(240).mul(unit),
        });
      await synth
        .connect(minter)
        .approve(factory.address, BigNumber.from(2).mul(unit));
      await factory
        .connect(minter)
        .userManageSynth(
          tokenName,
          ethers.utils.parseUnits("1.6", decimal),
          BigNumber.from(160).mul(unit)
        );
      const minterBalance = BigNumber.from(240).mul(unit);
      const minterDebt = BigNumber.from(10).mul(unit);
      const minterDeposit = BigNumber.from(160).mul(unit);
      await assertFactoryState(
        minterBalance,
        minterDeposit,
        minterDeposit,
        minterDebt
      );
    });
  });

  it("User liquidate", async function () {
    const liquidationPenalty = ethers.utils.parseUnits("1.2", decimal);
    const minCollateralRatio = ethers.utils.parseUnits("1.5", decimal);
    await setUp(liquidationPenalty, minCollateralRatio);
    const [_, minter, liquidator] = await ethers.getSigners();
    const minterAddress = minter.address;
    const liquidatorAddress = liquidator.address;

    await Promise.all([
      setUpUserAccount(minter, BigNumber.from(3100).mul(unit)),
      network.provider.send("hardhat_setBalance", [
        liquidator.address,
        BigNumber.from(300).mul(unit).toHexString(),
      ]),
      oracle.setAssetPrice(tokenName, BigNumber.from(60).mul(unit)),
    ]);

    await factory
      .connect(minter)
      .userMintSynth(tokenName, ethers.utils.parseUnits("2.25", decimal), {
        value: BigNumber.from(2700).mul(unit),
      });
    await Promise.all([
      oracle.setAssetPrice(tokenName, BigNumber.from(100).mul(unit)),
      synth.mintSynth(liquidatorAddress, BigNumber.from(12).mul(unit)),
    ]);
    await synth
      .connect(liquidator)
      .approve(factory.address, BigNumber.from(11).mul(unit));

    await factory
      .connect(liquidator)
      .userLiquidate(tokenName, minterAddress, BigNumber.from(11).mul(unit));

    expect(await synth.balanceOf(liquidatorAddress)).to.equal(
      BigNumber.from(2).mul(unit)
    );
    expect(await synth.balanceOf(minterAddress)).to.equal(
      BigNumber.from(20).mul(unit)
    );
    const minterDeposit = await reserve.getMinterDebt(minterAddress);
    expect(
      closeBigNumber(
        minterDeposit,
        BigNumber.from(1500).mul(unit),
        BigNumber.from(1).mul(unit.sub(4))
      )
    );
    expect(await reserve.getMinterDebt(minterAddress)).to.equal(
      BigNumber.from(10).mul(unit)
    );
    expect(await getEthBalance(factory.address)).to.equal(
      BigNumber.from(1500).mul(unit)
    );
    const liquidatorBalance = await getEthBalance(liquidatorAddress);
    expect(
      closeBigNumber(
        liquidatorBalance,
        BigNumber.from(1500).mul(unit),
        BigNumber.from(1).mul(unit.sub(4))
      )
    );
  });
});
