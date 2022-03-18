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
import { beforeEach, it } from "mocha";
import { BigNumber } from "ethers";
import { getEthBalance } from "./shared/address";
import { closeBigNumber } from "./shared/math";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { exec } from "child_process";

describe("#Factory", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let liquidation: Liquidation;
  let oracle: MockOralce;
  let synth: Synth;
  let factory: Factory;
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

    const Factory = await ethers.getContractFactory("Factory", {
      libraries: {
        SafeDecimalMath: librarySafeDecimalMath.address,
      },
    });
    factory = (await upgrades.deployProxy(Factory, [], {
      unsafeAllowLinkedLibraries: true,
    })) as Factory;
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
    initialBalance: BigNumber,
    depositBalance: BigNumber
  ) {
    await network.provider.send("hardhat_setBalance", [
      signer.address,
      initialBalance.toHexString(),
    ]);

    await factory.connect(signer).userDepositEther(tokenName, {
      value: depositBalance,
    });
  };

  it("User deposit ether", async function () {
    const liquidationPenalty = BigNumber.from(120).mul(unit).div(100);
    const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
    await setUp(liquidationPenalty, minCollateralRatio);

    const [_, minter] = await ethers.getSigners();
    await setUpUserAccount(
      minter,
      BigNumber.from(1000).mul(unit),
      BigNumber.from(400).mul(unit)
    );

    expect(await getEthBalance(factory.address)).to.equal(
      BigNumber.from(400).mul(unit)
    );
    const minterEthBalance = await getEthBalance(minter.address);
    // Do an approximate match since there are gas costs.
    expect(
      closeBigNumber(
        minterEthBalance,
        BigNumber.from(600).mul(unit),
        BigNumber.from(1).mul(unit)
      )
    ).to.true;
    expect(await reserve.getMinterDeposit(minter.address)).to.equal(
      BigNumber.from(400).mul(unit)
    );
  });

  describe("Remaining mintable synth", async function () {
    let minterAddress: string;

    beforeEach(async function () {
      const liquidationPenalty = BigNumber.from(120).mul(unit).div(100);
      const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
      await setUp(liquidationPenalty, minCollateralRatio);
      const [_, minter] = await ethers.getSigners();
      minterAddress = minter.address;
    });

    it("Under collateralized", async function () {
      await Promise.all([
        reserve.addMinterDebt(minterAddress, BigNumber.from(2).mul(unit)),
        reserve.addMinterDeposit(minterAddress, BigNumber.from(300).mul(unit)),
        oracle.setAssetPrice(tokenName, BigNumber.from(110).mul(unit)),
      ]);
      await expect(
        factory.remainingMintableSynth(
          minterAddress,
          synth.address,
          reserve.address
        )
      ).to.be.revertedWith(await factory.ERR_USER_UNDER_COLLATERALIZED());
    });

    it("No debt", async function () {
      await Promise.all([
        reserve.addMinterDeposit(minterAddress, BigNumber.from(300).mul(unit)),
        oracle.setAssetPrice(tokenName, BigNumber.from(100).mul(unit)),
      ]);
      const mintableSynth = await factory.callStatic.remainingMintableSynth(
        minterAddress,
        synth.address,
        reserve.address
      );
      expect(
        closeBigNumber(
          mintableSynth,
          BigNumber.from(2).mul(unit),
          BigNumber.from(1).mul(unit.sub(10))
        )
      ).to.true;
    });

    it("With debt", async function () {
      await Promise.all([
        reserve.addMinterDebt(minterAddress, BigNumber.from(1).mul(unit)),
        reserve.addMinterDeposit(minterAddress, BigNumber.from(450).mul(unit)),
        oracle.setAssetPrice(tokenName, BigNumber.from(100).mul(unit)),
      ]);
      const mintableSynth = await factory.callStatic.remainingMintableSynth(
        minterAddress,
        synth.address,
        reserve.address
      );
      expect(
        closeBigNumber(
          mintableSynth,
          BigNumber.from(2).mul(unit),
          BigNumber.from(1).mul(unit.sub(10))
        )
      ).to.true;
    });
  });

  describe("User mint synth", async function () {
    let minterSigner: SignerWithAddress;
    let minterAddress: string;

    beforeEach(async function () {
      const liquidationPenalty = BigNumber.from(120).mul(unit).div(100);
      const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
      await setUp(liquidationPenalty, minCollateralRatio);
      const [_, minter] = await ethers.getSigners();
      minterSigner = minter;
      minterAddress = minter.address;
    });

    it("Not enough", async function () {
      await Promise.all([
        synth.mintSynth(minterAddress, BigNumber.from(2).mul(unit)),
        reserve.addMinterDeposit(minterAddress, BigNumber.from(300).mul(unit)),
        oracle.setAssetPrice(tokenName, BigNumber.from(60).mul(unit)),
      ]);
      await expect(
        factory
          .connect(minterSigner)
          .userMintSynth(tokenName, BigNumber.from(2).mul(unit))
      ).to.be.revertedWith(await factory.ERR_NOT_ENOUGH_SYNTH_TO_MINT());
    });

    it("Enough", async function () {
      await Promise.all([
        oracle.setAssetPrice(tokenName, BigNumber.from(60).mul(unit)),
        reserve.addMinterDeposit(minterAddress, BigNumber.from(300).mul(unit)),
        synth.mintSynth(minterAddress, BigNumber.from(2).mul(unit)),
      ]);
      await factory
        .connect(minterSigner)
        .userMintSynth(tokenName, BigNumber.from(BigNumber.from(1).mul(unit)));
      expect(await synth.balanceOf(minterAddress)).to.equal(
        BigNumber.from(3).mul(unit)
      );
      expect(await reserve.getMinterDebt(minterAddress)).to.equal(
        BigNumber.from(3).mul(unit)
      );
    });
  });

  describe("User burn synth", async function () {
    let minterSigner: SignerWithAddress;
    let minterAddress: string;

    beforeEach(async function () {
      const liquidationPenalty = BigNumber.from(120).mul(unit).div(100);
      const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
      await setUp(liquidationPenalty, minCollateralRatio);
      const [owner, minter] = await ethers.getSigners();
      minterSigner = minter;
      minterAddress = minter.address;
    });

    it("Not enough", async function () {
      await Promise.all([
        factory.connect(minterSigner).userDepositEther(tokenName, {
          value: BigNumber.from(300).mul(unit),
        }),
        oracle.setAssetPrice(tokenName, BigNumber.from(100).mul(unit)),
      ]);
      await factory
        .connect(minterSigner)
        .userMintSynth(tokenName, BigNumber.from(1).mul(unit));
      await expect(
        factory
          .connect(minterSigner)
          .userBurnSynth(tokenName, BigNumber.from(2).mul(unit))
      ).to.be.revertedWith(await factory.ERR_BURNING_EXCEED_DEBT());
    });

    it("Enough", async function () {
      await Promise.all([
        setUpUserAccount(
          minterSigner,
          BigNumber.from(1000).mul(unit),
          BigNumber.from(300).mul(unit)
        ),
        oracle.setAssetPrice(tokenName, BigNumber.from(60).mul(unit)),
      ]);
      await factory
        .connect(minterSigner)
        .userMintSynth(tokenName, BigNumber.from(3).mul(unit));
      await synth
        .connect(minterSigner)
        .approve(factory.address, BigNumber.from(2).mul(unit));
      await factory
        .connect(minterSigner)
        .userBurnSynth(tokenName, BigNumber.from(2).mul(unit));
      expect(await synth.balanceOf(minterAddress)).to.equal(
        BigNumber.from(1).mul(unit)
      );
      expect(await reserve.getMinterDebt(minterAddress)).to.equal(
        BigNumber.from(1).mul(unit)
      );
      const minterDeposit = await reserve.getMinterDeposit(minterAddress);
      expect(
        closeBigNumber(
          minterDeposit,
          BigNumber.from(100).mul(unit),
          BigNumber.from(1).mul(unit.sub(10))
        )
      );
      const minterEthBalance = await getEthBalance(minterAddress);
      expect(
        closeBigNumber(
          minterEthBalance,
          BigNumber.from(900).mul(unit),
          BigNumber.from(1).mul(unit.sub(4))
        )
      );
      const factoryEthBalance = await getEthBalance(factory.address);
      expect(
        closeBigNumber(
          factoryEthBalance,
          BigNumber.from(100).mul(unit),
          BigNumber.from(1).mul(unit.sub(10))
        )
      );
    });
  });

  it("User liquidate", async function () {
    const liquidationPenalty = BigNumber.from(120).mul(unit).div(100);
    const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
    await setUp(liquidationPenalty, minCollateralRatio);
    const [owner, minter, liquidator] = await ethers.getSigners();
    const ownerAddress = owner.address;
    const minterAddress = minter.address;
    const liquidatorAddress = liquidator.address;

    await Promise.all([
      setUpUserAccount(
        minter,
        BigNumber.from(3100).mul(unit),
        BigNumber.from(2700).mul(unit)
      ),
      network.provider.send("hardhat_setBalance", [
        liquidator.address,
        BigNumber.from(300).mul(unit).toHexString(),
      ]),
      oracle.setAssetPrice(tokenName, BigNumber.from(60).mul(unit)),
    ]);

    await factory
      .connect(minter)
      .userMintSynth(tokenName, BigNumber.from(20).mul(unit));
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
