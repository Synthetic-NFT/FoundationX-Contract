import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  MockOracle,
  Reserve,
  SafeDecimalMath,
  Synth,
  Vault,
} from "../typechain";
import { beforeEach, describe, it } from "mocha";
import { BigNumber } from "ethers";
import { getEthBalance } from "./shared/address";
import { closeBigNumber } from "./shared/math";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { deployReserve, deploySynth, deployVault } from "./shared/constructor";

describe("#Vault", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let oracle: MockOracle;
  let synth: Synth;
  let vault: Vault;
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
    minCollateralRatio: BigNumber,
    liquidationPenalty: BigNumber,
    NFTAddress: string,
    lockingPeriod: BigNumber
  ) {
    reserve = await deployReserve(
      librarySafeDecimalMath,
      minCollateralRatio,
      liquidationPenalty
    );
    synth = await deploySynth(reserve, oracle, tokenName, tokenSymbol);
    vault = await deployVault(synth, reserve, NFTAddress, lockingPeriod);
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
      const [_, minterSigner, NFTContract] = await ethers.getSigners();
      await setUp(
        minCollateralRatio,
        liquidationPenalty,
        NFTContract.address,
        BigNumber.from(0).mul(unit)
      );
      minter = minterSigner;
      minterAddress = minter.address;
      await Promise.all([
        setUpUserAccount(minter, BigNumber.from(400).mul(unit)),
        oracle.setAssetPrice(tokenName, BigNumber.from(10).mul(unit)),
      ]);
    });

    it("Invalid", async function () {
      await expect(
        vault
          .connect(minter)
          .userMintSynthETH(ethers.utils.parseUnits("1.4", decimal), {
            value: BigNumber.from(200).mul(unit),
          })
      ).to.be.revertedWith(await vault.ERR_INVALID_TARGET_COLLATERAL_RATIO());
    });

    it("Valid", async function () {
      const mintAndAssert = async function (
        collateralRatio: BigNumber,
        mintDeposit: BigNumber,
        postDebt: BigNumber,
        postDeposit: BigNumber
      ) {
        await vault
          .connect(minter)
          .userMintSynthETH(collateralRatio, { value: mintDeposit });
        expect(await getEthBalance(vault.address)).to.equal(postDeposit);
        expect(await synth.balanceOf(minterAddress)).to.equal(postDebt);
        expect(await reserve.getMinterDebtETH(minterAddress)).to.equal(
          postDebt
        );
        expect(await reserve.getMinterDepositETH(minterAddress)).to.equal(
          postDeposit
        );
      };

      await mintAndAssert(
        ethers.utils.parseUnits("1.6", decimal),
        BigNumber.from(160).mul(unit),
        BigNumber.from(10).mul(unit),
        BigNumber.from(160).mul(unit)
      );
      await mintAndAssert(
        ethers.utils.parseUnits("1.5", decimal),
        BigNumber.from(150).mul(unit),
        BigNumber.from(20).mul(unit),
        BigNumber.from(310).mul(unit)
      );
    });
  });

  it("User burn synth", async function () {
    const liquidationPenalty = ethers.utils.parseUnits("1.2", decimal);
    const minCollateralRatio = ethers.utils.parseUnits("1.5", decimal);
    const [_, minter, NFTContract] = await ethers.getSigners();
    await setUp(
      minCollateralRatio,
      liquidationPenalty,
      NFTContract.address,
      BigNumber.from(0).mul(unit)
    );
    const minterAddress = minter.address;

    await Promise.all([
      setUpUserAccount(minter, BigNumber.from(400).mul(unit)),
      oracle.setAssetPrice(tokenName, BigNumber.from(10).mul(unit)),
    ]);
    await vault
      .connect(minter)
      .userMintSynthETH(ethers.utils.parseUnits("1.6", decimal), {
        value: BigNumber.from(320).mul(unit),
      });
    await synth
      .connect(minter)
      .approve(vault.address, BigNumber.from(20).mul(unit));
    await vault.connect(minter).userBurnSynthETH();

    expect(await getEthBalance(vault.address)).to.equal(
      BigNumber.from(0).mul(unit)
    );
    expect(await synth.balanceOf(minterAddress)).to.equal(
      BigNumber.from(0).mul(unit)
    );
    expect(await reserve.getMinterDebtETH(minterAddress)).to.equal(
      BigNumber.from(0).mul(unit)
    );
    expect(await reserve.getMinterDepositETH(minterAddress)).to.equal(
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
      const [_, minterSigner, NFTContract] = await ethers.getSigners();
      await setUp(
        minCollateralRatio,
        liquidationPenalty,
        NFTContract.address,
        BigNumber.from(0).mul(unit)
      );
      minter = minterSigner;
      minterAddress = minter.address;
      await Promise.all([
        setUpUserAccount(minter, BigNumber.from(400).mul(unit)),
        oracle.setAssetPrice(tokenName, BigNumber.from(10).mul(unit)),
      ]);
    });

    const assertVaultState = async function (
      minterBalance: BigNumber,
      vaultBalance: BigNumber,
      minterDeposit: BigNumber,
      minterDebt: BigNumber
    ) {
      expect(await getEthBalance(vault.address)).to.equal(vaultBalance);
      expect(await synth.balanceOf(minterAddress)).to.equal(minterDebt);
      expect(await reserve.getMinterDebtETH(minterAddress)).to.equal(
        minterDebt
      );
      expect(await reserve.getMinterDepositETH(minterAddress)).to.equal(
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
      await vault
        .connect(minter)
        .userMintSynthETH(ethers.utils.parseUnits("1.6", decimal), {
          value: BigNumber.from(160).mul(unit),
        });
      await vault
        .connect(minter)
        .userManageSynthETH(
          ethers.utils.parseUnits("1.7", decimal),
          BigNumber.from(340).mul(unit),
          { value: BigNumber.from(180).mul(unit) }
        );
      const minterBalance = BigNumber.from(60).mul(unit);
      const minterDebt = BigNumber.from(20).mul(unit);
      const minterDeposit = BigNumber.from(340).mul(unit);
      await assertVaultState(
        minterBalance,
        minterDeposit,
        minterDeposit,
        minterDebt
      );
    });

    it("Add deposit reduce debt", async function () {
      await vault
        .connect(minter)
        .userMintSynthETH(ethers.utils.parseUnits("1.6", decimal), {
          value: BigNumber.from(160).mul(unit),
        });
      await synth
        .connect(minter)
        .approve(vault.address, BigNumber.from(1).mul(unit));
      await vault
        .connect(minter)
        .userManageSynthETH(
          ethers.utils.parseUnits("2.0", decimal),
          BigNumber.from(180).mul(unit),
          { value: BigNumber.from(20).mul(unit) }
        );
      const minterBalance = BigNumber.from(220).mul(unit);
      const minterDebt = BigNumber.from(9).mul(unit);
      const minterDeposit = BigNumber.from(180).mul(unit);
      await assertVaultState(
        minterBalance,
        minterDeposit,
        minterDeposit,
        minterDebt
      );
    });

    it("Reduce deposit add debt", async function () {
      await vault
        .connect(minter)
        .userMintSynthETH(ethers.utils.parseUnits("2.0", decimal), {
          value: BigNumber.from(180).mul(unit),
        });
      await vault
        .connect(minter)
        .userManageSynthETH(
          ethers.utils.parseUnits("1.6", decimal),
          BigNumber.from(160).mul(unit)
        );
      const minterBalance = BigNumber.from(240).mul(unit);
      const minterDebt = BigNumber.from(10).mul(unit);
      const minterDeposit = BigNumber.from(160).mul(unit);
      await assertVaultState(
        minterBalance,
        minterDeposit,
        minterDeposit,
        minterDebt
      );
    });

    it("Reduce deposit reduce debt", async function () {
      await vault
        .connect(minter)
        .userMintSynthETH(ethers.utils.parseUnits("2.0", decimal), {
          value: BigNumber.from(240).mul(unit),
        });
      await synth
        .connect(minter)
        .approve(vault.address, BigNumber.from(2).mul(unit));
      await vault
        .connect(minter)
        .userManageSynthETH(
          ethers.utils.parseUnits("1.6", decimal),
          BigNumber.from(160).mul(unit)
        );
      const minterBalance = BigNumber.from(240).mul(unit);
      const minterDebt = BigNumber.from(10).mul(unit);
      const minterDeposit = BigNumber.from(160).mul(unit);
      await assertVaultState(
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
    const [_, minter, liquidator, NFTContract] = await ethers.getSigners();
    await setUp(
      minCollateralRatio,
      liquidationPenalty,
      NFTContract.address,
      BigNumber.from(0).mul(unit)
    );
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

    await vault
      .connect(minter)
      .userMintSynthETH(ethers.utils.parseUnits("2.25", decimal), {
        value: BigNumber.from(2700).mul(unit),
      });
    await Promise.all([
      oracle.setAssetPrice(tokenName, BigNumber.from(100).mul(unit)),
      synth.mintSynth(liquidatorAddress, BigNumber.from(12).mul(unit)),
    ]);
    await synth
      .connect(liquidator)
      .approve(vault.address, BigNumber.from(11).mul(unit));

    await vault
      .connect(liquidator)
      .userLiquidateETH(minterAddress, BigNumber.from(11).mul(unit));

    expect(await synth.balanceOf(liquidatorAddress)).to.equal(
      BigNumber.from(2).mul(unit)
    );
    expect(await synth.balanceOf(minterAddress)).to.equal(
      BigNumber.from(20).mul(unit)
    );
    const minterDeposit = await reserve.getMinterDebtETH(minterAddress);
    expect(
      closeBigNumber(
        minterDeposit,
        BigNumber.from(1500).mul(unit),
        BigNumber.from(1).mul(unit.sub(4))
      )
    );
    expect(await reserve.getMinterDebtETH(minterAddress)).to.equal(
      BigNumber.from(10).mul(unit)
    );
    expect(await getEthBalance(vault.address)).to.equal(
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
