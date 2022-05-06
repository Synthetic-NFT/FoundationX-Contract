// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { BigNumber } from "ethers";
import { Reserve, Vault } from "../typechain";

const { ethers, upgrades } = require("hardhat");
// eslint-disable-next-line node/no-extraneous-require

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  const [owner] = await ethers.getSigners();
  console.log("Owner address", owner.address);

  const SafeDecimalMath = await ethers.getContractFactory("SafeDecimalMath");
  const safeDecimalMath = await SafeDecimalMath.deploy();
  await safeDecimalMath.deployed();
  console.log("SafeDecimalMath deployed to:", safeDecimalMath.address);
  const unit = await safeDecimalMath.unit();
  const decimal = await safeDecimalMath.decimals();

  const Reserve = await ethers.getContractFactory("Reserve", {
    libraries: {
      SafeDecimalMath: safeDecimalMath.address,
    },
  });
  const reserve = (await upgrades.deployProxy(
    Reserve,
    [
      ethers.utils.parseUnits("1.5", decimal),
      ethers.utils.parseUnits("1.2", decimal),
    ],
    { unsafeAllowLinkedLibraries: true }
  )) as Reserve;
  console.log("Reserve deployed to:", reserve.address);

  const MockOracle = await ethers.getContractFactory("MockOracle");
  const oracle = await MockOracle.deploy();
  console.log("Oracle deployed to:", oracle.address);

  const boredApeName = "BoredApeYachtClub";

  const Synth = await ethers.getContractFactory("Synth");
  const synth = await upgrades.deployProxy(
    Synth,
    [reserve.address, oracle.address, boredApeName, "$BAYC"],
    {
      unsafeAllow: ["external-library-linking"],
    }
  );
  await synth.deployed();
  console.log("Synth deployed to:", synth.address);

  const Vault = await ethers.getContractFactory("Vault");
  const vault = (await upgrades.deployProxy(Vault, [
    synth.address,
    reserve.address,
  ])) as Vault;
  console.log("Vault deployed to:", vault.address);

  await reserve.grantRole(await reserve.MINTER_ROLE(), vault.address);
  await reserve.grantRole(await reserve.MINTER_ROLE(), synth.address);
  await synth.grantRole(await synth.MINTER_ROLE(), vault.address);
  await reserve.grantRole(await reserve.DEFAULT_ADMIN_ROLE(), synth.address);

  const Factory = await ethers.getContractFactory("Factory");
  const factory = await upgrades.deployProxy(Factory, []);
  await factory.deployed();
  console.log("Factory deployed to:", factory.address);

  await factory.listVaults([boredApeName], [vault.address]);
  await oracle.setAssetPrice(boredApeName, BigNumber.from(120).mul(unit));
  console.log(await synth.getSynthPriceToEth());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
