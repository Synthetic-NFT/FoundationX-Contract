import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  IOracle,
  Reserve,
  SafeDecimalMath,
  Synth,
  Vault,
} from "../../typechain";

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

export async function deployVault(
  synth: Synth,
  reserve: Reserve,
  NFTAddress: string,
  lockingPeriod: BigNumber
): Promise<Vault> {
  const Vault = await ethers.getContractFactory("Vault");
  const vault = (await upgrades.deployProxy(Vault, [
    synth.address,
    reserve.address,
    NFTAddress,
    lockingPeriod,
  ])) as Vault;

  await reserve.grantRole(await reserve.MINTER_ROLE(), vault.address);
  await synth.grantRole(await synth.MINTER_ROLE(), vault.address);

  return vault;
}
