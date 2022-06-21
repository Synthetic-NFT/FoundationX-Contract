import {
  Factory,
  IOracle,
  Reserve,
  SafeDecimalMath,
  Synth,
  Vault,
} from "../typechain";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { describe, it } from "mocha";
import { expect } from "chai";
import {
  deployFactory,
  deployMockOracle,
  deployReserve,
  deploySafeDecimalMath,
  deploySynth,
  deployVault,
} from "./shared/constructor";

const {
  BN, // Big Number support
  constants, // Common constants, like the zero address and largest integers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");

describe("#Factory", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let decimal: number;
  let unit: BigNumber;
  let oracle: IOracle;
  let ownerAddress: string;
  const tokenName1 = "CryptoPunks";
  const tokenSymbol1 = "$PUNK";
  const tokenName2 = "BoredApeYachtClub";
  const tokenSymbol2 = "$BAYC";
  let reserve1: Reserve;
  let reserve2: Reserve;
  let synth1: Synth;
  let synth2: Synth;
  let vault1: Vault;
  let vault2: Vault;
  let factory: Factory;

  const setUpVault = async function (
    minCollateralRatio: BigNumber,
    liquidationPenalty: BigNumber,
    tokenName: string,
    tokenSymbol: string,
    NFTAddress: string,
    lockingPeriod: BigNumber
  ): Promise<[Reserve, Synth, Vault]> {
    const reserve = await deployReserve(
      librarySafeDecimalMath,
      minCollateralRatio,
      liquidationPenalty
    );
    const synth = await deploySynth(reserve, oracle, tokenName, tokenSymbol);
    const vault = await deployVault(
      librarySafeDecimalMath,
      synth,
      reserve,
      constants.ZERO_ADDRESS,
      NFTAddress,
      lockingPeriod
    );
    await reserve.grantRole(await reserve.MINTER_ROLE(), ownerAddress);
    return [reserve, synth, vault];
  };

  beforeEach(async function () {
    const [owner, NFTContract, NFTContract2] = await ethers.getSigners();
    ownerAddress = owner.address;
    librarySafeDecimalMath = await deploySafeDecimalMath();
    decimal = await librarySafeDecimalMath.decimals();
    unit = await librarySafeDecimalMath.UNIT();
    oracle = await deployMockOracle();
    [reserve1, synth1, vault1] = await setUpVault(
      ethers.utils.parseUnits("1.5", decimal),
      ethers.utils.parseUnits("1.2", decimal),
      tokenName1,
      tokenSymbol1,
      NFTContract.address,
      BigNumber.from(0).mul(unit)
    );
    [reserve2, synth2, vault2] = await setUpVault(
      ethers.utils.parseUnits("1.5", decimal),
      ethers.utils.parseUnits("1.2", decimal),
      tokenName2,
      tokenSymbol2,
      NFTContract2.address,
      BigNumber.from(0).mul(unit)
    );
    factory = await deployFactory();
    await factory.listVaults(
      [tokenName1, tokenName2],
      [vault1.address, vault2.address]
    );
  });

  it("List debts deposits", async function () {
    await reserve1.addMinterDebtETH(ownerAddress, BigNumber.from(1).mul(unit));
    await reserve1.addMinterDepositETH(
      ownerAddress,
      BigNumber.from(200).mul(unit)
    );
    await reserve2.addMinterDebtETH(ownerAddress, BigNumber.from(2).mul(unit));
    await reserve2.addMinterDepositETH(
      ownerAddress,
      BigNumber.from(300).mul(unit)
    );
    await reserve1.addMinterDepositNFT(ownerAddress, BigNumber.from(5));
    await reserve2.addMinterDepositNFT(ownerAddress, BigNumber.from(3));

    expect(
      await factory.listUserDebtDeposit(ownerAddress, [tokenName2, tokenName1])
    ).to.eql([
      [BigNumber.from(2).mul(unit), BigNumber.from(1).mul(unit)],
      [BigNumber.from(300).mul(unit), BigNumber.from(200).mul(unit)],
      [[BigNumber.from(3)], [BigNumber.from(5)]],
    ]);
  });

  it("List token address info", async function () {
    const [_, NFTContract, NFTContract2] = await ethers.getSigners();

    expect(await factory.listTokenAddressInfo()).to.eql([
      [tokenName1, tokenName2],
      [tokenSymbol1, tokenSymbol2],
      [vault1.address, vault2.address],
      [synth1.address, synth2.address],
      [reserve1.address, reserve2.address],
      [NFTContract.address, NFTContract2.address],
    ]);
    await factory.delistVaults([tokenName1]);
    expect(await factory.listTokenAddressInfo()).to.eql([
      [tokenName2],
      [tokenSymbol2],
      [vault2.address],
      [synth2.address],
      [reserve2.address],
      [NFTContract2.address],
    ]);
  });
});
