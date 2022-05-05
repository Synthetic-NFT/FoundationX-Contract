import {
  Factory,
  IOracle,
  MockOracle,
  Reserve,
  SafeDecimalMath,
  Synth,
  Vault,
} from "../typechain";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import { describe, it } from "mocha";
import { expect } from "chai";

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
    liquidationPenalty: BigNumber,
    minCollateralRatio: BigNumber,
    tokenName: string,
    tokenSymbol: string
  ): Promise<[Reserve, Vault]> {
    const Reserve = await ethers.getContractFactory("Reserve", {
      libraries: {
        SafeDecimalMath: librarySafeDecimalMath.address,
      },
    });
    const reserve = (await upgrades.deployProxy(
      Reserve,
      [minCollateralRatio, liquidationPenalty],
      { unsafeAllowLinkedLibraries: true }
    )) as Reserve;

    const Synth = await ethers.getContractFactory("Synth");
    const synth = (await upgrades.deployProxy(Synth, [
      reserve.address,
      oracle.address,
      tokenName,
      tokenSymbol,
    ])) as Synth;

    const Vault = await ethers.getContractFactory("Vault");
    const vault = (await upgrades.deployProxy(Vault, [
      synth.address,
      reserve.address,
    ])) as Vault;

    await reserve.grantRole(await reserve.MINTER_ROLE(), vault.address);
    await reserve.grantRole(await reserve.MINTER_ROLE(), synth.address);
    await reserve.grantRole(await reserve.MINTER_ROLE(), ownerAddress);
    await synth.grantRole(await synth.MINTER_ROLE(), vault.address);
    await reserve.grantRole(await reserve.DEFAULT_ADMIN_ROLE(), synth.address);

    return [reserve, vault];
  };

  beforeEach(async function () {
    const [owner] = await ethers.getSigners();
    ownerAddress = owner.address;
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    decimal = await librarySafeDecimalMath.decimals();
    unit = await librarySafeDecimalMath.UNIT();
    const MockOracle = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracle.deploy();
    [reserve1, vault1] = await setUpVault(
      ethers.utils.parseUnits("1.2", decimal),
      ethers.utils.parseUnits("1.5", decimal),
      tokenName1,
      tokenSymbol1
    );
    [reserve2, vault2] = await setUpVault(
      ethers.utils.parseUnits("1.2", decimal),
      ethers.utils.parseUnits("1.5", decimal),
      tokenName2,
      tokenSymbol2
    );
    const Factory = await ethers.getContractFactory("Factory");
    factory = (await upgrades.deployProxy(Factory, [])) as Factory;
    await factory.listVaults(
      [tokenName1, tokenName2],
      [vault1.address, vault2.address]
    );
  });

  it("List debts deposits", async function () {
    await reserve1.addMinterDebt(ownerAddress, BigNumber.from(1).mul(unit));
    await reserve1.addMinterDeposit(
      ownerAddress,
      BigNumber.from(200).mul(unit)
    );
    await reserve2.addMinterDebt(ownerAddress, BigNumber.from(2).mul(unit));
    await reserve2.addMinterDeposit(
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
