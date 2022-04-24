// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { BigNumber } from "ethers";
const { ethers, upgrades } = require("hardhat");
// eslint-disable-next-line node/no-extraneous-require
const { getImplementationAddress } = require("@openzeppelin/upgrades-core");
const hre = require("hardhat");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  const SafeDecimalMath = await ethers.getContractFactory("SafeDecimalMath");
  const safeDecimalMath = await SafeDecimalMath.deploy();
  await safeDecimalMath.deployed();
  console.log("SafeDecimalMath deployed to:", safeDecimalMath.address);

  const Reserve = await ethers.getContractFactory("Reserve");
  const unit = await safeDecimalMath.unit();
  const minCollateralRatio = BigNumber.from(150).mul(unit).div(100);
  const reserve = await upgrades.deployProxy(Reserve, [minCollateralRatio]);
  await reserve.deployed();
  console.log("Reserve deployed to:", reserve.address);
  // const currentImplAddress = await getImplementationAddress(provider, reserve.address);
  // console.log(await hre.upgrades.erc1967.getImplementationAddress(reserve.address));
  // const implHex = await ethers.provider.getStorageAt(
  //     reserve.address,
  //     "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  // );
  // const implAddress = ethers.utils.hexStripZeros(implHex);
  // console.log(implAddress);
  // console.log(await reserve.getMinCollateralRatio());
  const Liquidation = await ethers.getContractFactory("Liquidation", {
    libraries: {
      SafeDecimalMath: safeDecimalMath.address,
    },
  });

  const liquidationPenalty = BigNumber.from(120).mul(unit).div(100);
  const liquidation = await upgrades.deployProxy(
    Liquidation,
    [reserve.address, liquidationPenalty],
    {
      unsafeAllow: ["external-library-linking"],
    }
  );
  await liquidation.deployed();
  console.log("Liquidation deployed to:", liquidation.address);

  const MockOracle = await ethers.getContractFactory("MockOralce");
  const oracle = await MockOracle.deploy();
  console.log("Oracle deployed to:", oracle.address);

  const Synth = await ethers.getContractFactory("Synth");
  const synth = await upgrades.deployProxy(
    Synth,
    [reserve.address, liquidation.address, oracle.address, "SynthTest1", "ST1"],
    {
      unsafeAllow: ["external-library-linking"],
    }
  );
  await synth.deployed();
  console.log("Synth deployed to:", synth.address);

  const Factory = await ethers.getContractFactory("Factory");
  const factory = await upgrades.deployProxy(Factory, []);
  await factory.deployed();
  console.log("Factory deployed to:", factory.address);

  await factory.listSynth("SynthTest1", synth.address, reserve.address);
  await reserve.grantRole(await reserve.MINTER_ROLE(), factory.address);
  await reserve.grantRole(await reserve.MINTER_ROLE(), synth.address);
  await synth.grantRole(await synth.MINTER_ROLE(), factory.address);
  await liquidation.grantRole(
    await liquidation.DEFAULT_ADMIN_ROLE(),
    synth.address
  );
  await oracle.setAssetPrice("SynthTest1", "2000000000000000000");
  console.log(await synth.getSynthPriceToEth());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
