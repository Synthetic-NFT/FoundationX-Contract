import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  MockNFT,
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
import {
  deployMockNFT,
  deployMockOracle,
  deployReserve,
  deploySafeDecimalMath,
  deploySynth,
  deployVault,
} from "./shared/constructor";

describe("#Vault", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let reserve: Reserve;
  let oracle: MockOracle;
  let synth: Synth;
  let NFT: MockNFT;
  let vault: Vault;
  let decimal: number;
  let unit: BigNumber;
  const tokenName = "CryptoPunks";
  const tokenSymbol = "$PUNK";
  const NFTName = "CryptoPunks_NFT";
  const NFTSymbol = "$PUNK_NFT";

  beforeEach(async function () {
    librarySafeDecimalMath = await deploySafeDecimalMath();
    decimal = await librarySafeDecimalMath.decimals();
    unit = await librarySafeDecimalMath.UNIT();
    oracle = await deployMockOracle();
  });

  const setUp = async function (
    minCollateralRatio: BigNumber,
    liquidationPenalty: BigNumber,
    lockingPeriod: BigNumber
  ) {
    reserve = await deployReserve(
      librarySafeDecimalMath,
      minCollateralRatio,
      liquidationPenalty
    );
    synth = await deploySynth(reserve, oracle, tokenName, tokenSymbol);
    NFT = await deployMockNFT(NFTName, NFTSymbol);
    vault = await deployVault(
      librarySafeDecimalMath,
      synth,
      reserve,
      NFT.address,
      lockingPeriod
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

  describe("User mint synth ETH", async function () {
    let minter: SignerWithAddress;
    let minterAddress: string;

    beforeEach(async function () {
      const liquidationPenalty = ethers.utils.parseUnits("1.2", decimal);
      const minCollateralRatio = ethers.utils.parseUnits("1.5", decimal);
      const [_, minterSigner] = await ethers.getSigners();
      await setUp(
        minCollateralRatio,
        liquidationPenalty,
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

  it("User burn synth ETH", async function () {
    const liquidationPenalty = ethers.utils.parseUnits("1.2", decimal);
    const minCollateralRatio = ethers.utils.parseUnits("1.5", decimal);
    const [_, minter] = await ethers.getSigners();
    await setUp(
      minCollateralRatio,
      liquidationPenalty,
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

  describe("User manage synth ETH", async function () {
    let minter: SignerWithAddress;
    let minterAddress: string;

    beforeEach(async function () {
      const liquidationPenalty = ethers.utils.parseUnits("1.2", decimal);
      const minCollateralRatio = ethers.utils.parseUnits("1.5", decimal);
      const [_, minterSigner] = await ethers.getSigners();
      await setUp(
        minCollateralRatio,
        liquidationPenalty,
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

  it("User liquidate ETH", async function () {
    const liquidationPenalty = ethers.utils.parseUnits("1.2", decimal);
    const minCollateralRatio = ethers.utils.parseUnits("1.5", decimal);
    const [_, minter, liquidator] = await ethers.getSigners();
    await setUp(
      minCollateralRatio,
      liquidationPenalty,
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

  describe("User mint synth NFT", async function () {
    let minter: SignerWithAddress;
    let minterAddress: string;

    beforeEach(async function () {
      await setUp(
        ethers.utils.parseUnits("1.5", decimal),
        ethers.utils.parseUnits("1.2", decimal),
        BigNumber.from(0).mul(unit)
      );
      const [_, minterSigner] = await ethers.getSigners();
      minter = minterSigner;
      minterAddress = minter.address;
      await NFT.mint(minterAddress, BigNumber.from(0));
      await NFT.mint(minterAddress, BigNumber.from(1));
    });

    it("Not NFT owner", async function () {
      await NFT.mint(vault.address, BigNumber.from(2));
      await expect(
        vault.connect(minter).userMintSynthNFT([BigNumber.from(2)])
      ).to.be.revertedWith(await vault.ERR_NOT_NFT_OWNER());
    });

    it("NFT in holdings", async function () {
      const depositedNFTs = [BigNumber.from(0), BigNumber.from(1)];
      for (const depositedNFT of depositedNFTs) {
        await NFT.connect(minter).approve(vault.address, depositedNFT);
      }

      await vault.connect(minter).userMintSynthNFT(depositedNFTs);
      for (const depositedNFT of depositedNFTs) {
        expect(await NFT.ownerOf(depositedNFT)).to.be.equal(vault.address);
        expect(await vault.NFTDepositer(depositedNFT)).to.be.equal(
          minterAddress
        );
      }
      expect(await synth.totalSupply()).to.be.equal(
        BigNumber.from(depositedNFTs.length).mul(unit)
      );
      expect(await synth.balanceOf(minterAddress)).to.be.equal(
        BigNumber.from(depositedNFTs.length).mul(unit)
      );
      expect(await reserve.getMinterDebtNFT(minterAddress)).to.be.eql(
        BigNumber.from(depositedNFTs.length).mul(unit)
      );
      expect(await reserve.getMinterDepositNFT(minterAddress)).to.be.eql(
        depositedNFTs
      );

      await expect(
        vault.connect(minter).userMintSynthNFT([BigNumber.from(1)])
      ).to.be.revertedWith(await vault.ERR_NFT_ALREADY_IN_HOLDINGS());
    });
  });

  describe("User burn synth NFT", async function () {
    let minter: SignerWithAddress;
    let burner: SignerWithAddress;
    let minterAddress: string;
    let burnerAddress: string;
    let blockTimestampBefore: number;
    const lockingPeriod = 60;

    beforeEach(async function () {
      const blockNumBefore = await ethers.provider.getBlockNumber();
      blockTimestampBefore = (await ethers.provider.getBlock(blockNumBefore))
        .timestamp;
      await setUp(
        ethers.utils.parseUnits("1.5", decimal),
        ethers.utils.parseUnits("1.2", decimal),
        BigNumber.from(lockingPeriod)
      );

      const [_, minterSigner, burnerSigner] = await ethers.getSigners();
      minter = minterSigner;
      burner = burnerSigner;
      minterAddress = minter.address;
      burnerAddress = burner.address;

      const depositedNFTs = [BigNumber.from(0), BigNumber.from(1)];
      for (const depositedNFT of depositedNFTs) {
        await NFT.mint(minterAddress, depositedNFT);
        await NFT.connect(minter).approve(vault.address, depositedNFT);
      }
      await vault.connect(minter).userMintSynthNFT(depositedNFTs);
    });

    it("Minter redeem", async function () {
      await synth
        .connect(minter)
        .approve(vault.address, BigNumber.from(1).mul(unit));
      await vault.connect(minter).userBurnSynthNFT([BigNumber.from(0)]);
      expect(await synth.totalSupply()).to.be.equal(
        BigNumber.from(1).mul(unit)
      );
      expect(await synth.balanceOf(minterAddress)).to.be.equal(
        BigNumber.from(1).mul(unit)
      );
      expect(await reserve.getMinterDebtNFT(minterAddress)).to.be.eql(
        BigNumber.from(1).mul(unit)
      );
      expect(await reserve.getMinterDepositNFT(minterAddress)).to.be.eql([
        BigNumber.from(1),
      ]);
    });

    it("Burner redeem", async function () {
      await synth
        .connect(burner)
        .approve(vault.address, BigNumber.from(1).mul(unit));
      await expect(
        vault.connect(burner).userBurnSynthNFT([BigNumber.from(0)])
      ).to.be.revertedWith(await vault.ERR_WITHIN_LOCKING_PERIOD());

      await ethers.provider.send("evm_setNextBlockTimestamp", [
        blockTimestampBefore + lockingPeriod + 1,
      ]);
    });
  });
});
