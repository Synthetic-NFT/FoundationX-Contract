import {
  Factory,
  IOracle,
  MockOracle,
  Reserve,
  SafeDecimalMath,
  Vault,
} from "../typechain";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import { describe, it } from "mocha";
import { expect } from "chai";
import { deployReserve, deploySynth, deployVault } from "./shared/constructor";

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
  ): Promise<[Reserve, Vault]> {
    const reserve = await deployReserve(
      librarySafeDecimalMath,
      minCollateralRatio,
      liquidationPenalty
    );
    const synth = await deploySynth(reserve, oracle, tokenName, tokenSymbol);
    const vault = await deployVault(synth, reserve, NFTAddress, lockingPeriod);
    await reserve.grantRole(await reserve.MINTER_ROLE(), ownerAddress);
    return [reserve, vault];
  };

  beforeEach(async function () {
    const [owner, NFTContract] = await ethers.getSigners();
    ownerAddress = owner.address;
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    decimal = await librarySafeDecimalMath.decimals();
    unit = await librarySafeDecimalMath.UNIT();
    const MockOracle = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracle.deploy();
    [reserve1, vault1] = await setUpVault(
      ethers.utils.parseUnits("1.5", decimal),
      ethers.utils.parseUnits("1.2", decimal),
      tokenName1,
      tokenSymbol1,
      NFTContract.address,
      BigNumber.from(0).mul(unit)
    );
    [reserve2, vault2] = await setUpVault(
      ethers.utils.parseUnits("1.5", decimal),
      ethers.utils.parseUnits("1.2", decimal),
      tokenName2,
      tokenSymbol2,
      NFTContract.address,
      BigNumber.from(0).mul(unit)
    );
    const Factory = await ethers.getContractFactory("Factory");
    factory = (await upgrades.deployProxy(Factory, [])) as Factory;
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
    expect(
      await factory.listUserDebtDeposit(ownerAddress, [tokenName2, tokenName1])
    ).to.be.eql([
      [BigNumber.from(2).mul(unit), BigNumber.from(1).mul(unit)],
      [BigNumber.from(300).mul(unit), BigNumber.from(200).mul(unit)],
    ]);
  });
});
