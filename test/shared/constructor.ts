import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  Factory,
  IOracle,
  MockNFT,
  MockOracle,
  MockWETH,
  Oracle,
  Reserve,
  SafeDecimalMath,
  Synth,
  Vault,
} from "../../typechain";

export async function deploySafeDecimalMath(): Promise<SafeDecimalMath> {
  const SafeDecimalMath = await ethers.getContractFactory("SafeDecimalMath");
  const safeDecimalMath = await SafeDecimalMath.deploy();
  await safeDecimalMath.deployed();
  return safeDecimalMath;
}

export async function deployMockOracle(): Promise<MockOracle> {
  const MockOracle = await ethers.getContractFactory("MockOracle");
  const oracle = await MockOracle.deploy();
  return oracle;
}

export async function deployOracle(
  oracleAddress: string,
  priceStalePeriod: BigNumber
): Promise<Oracle> {
  const Oracle = await ethers.getContractFactory("Oracle");
  const oracle = (await upgrades.deployProxy(Oracle, [
    oracleAddress,
    priceStalePeriod,
  ])) as Oracle;
  return oracle;
}

export async function deployMockWETH(
  name: string,
  symbol: string
): Promise<MockWETH> {
  const MockWETH = await ethers.getContractFactory("MockWETH");
  return (await upgrades.deployProxy(MockWETH, [name, symbol])) as MockWETH;
}

export async function deployReserve(
  librarySafeDecimalMath: SafeDecimalMath,
  minCollateralRatio: BigNumber,
  liquidationPenalty: BigNumber
): Promise<Reserve> {
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

  return reserve;
}

export async function deploySynth(
  reserve: Reserve,
  oracle: IOracle,
  tokenName: string,
  tokenSymbol: string
): Promise<Synth> {
  const Synth = await ethers.getContractFactory("Synth");
  const synth = (await upgrades.deployProxy(Synth, [
    reserve.address,
    oracle.address,
    tokenName,
    tokenSymbol,
  ])) as Synth;

  await reserve.grantRole(await reserve.DEFAULT_ADMIN_ROLE(), synth.address);
  await reserve.grantRole(await reserve.MINTER_ROLE(), synth.address);
  return synth;
}

export async function deployMockNFT(
  tokenName: string,
  tokenSymbol: string
): Promise<MockNFT> {
  const MockNFT = await ethers.getContractFactory("MockNFT");
  return (await upgrades.deployProxy(MockNFT, [
    tokenName,
    tokenSymbol,
  ])) as MockNFT;
}

export async function deployVault(
  librarySafeDecimalMath: SafeDecimalMath,
  synth: Synth,
  reserve: Reserve,
  WETH: string,
  NFTAddress: string,
  lockingPeriod: BigNumber
): Promise<Vault> {
  const Vault = await ethers.getContractFactory("Vault", {
    libraries: {
      SafeDecimalMath: librarySafeDecimalMath.address,
    },
  });
  const vault = (await upgrades.deployProxy(
    Vault,
    [synth.address, reserve.address, WETH, NFTAddress, lockingPeriod],
    { unsafeAllowLinkedLibraries: true }
  )) as Vault;

  await reserve.grantRole(await reserve.MINTER_ROLE(), vault.address);
  await synth.grantRole(await synth.MINTER_ROLE(), vault.address);

  return vault;
}

export async function deployFactory(): Promise<Factory> {
  const Factory = await ethers.getContractFactory("Factory");
  return (await upgrades.deployProxy(Factory, [])) as Factory;
}
