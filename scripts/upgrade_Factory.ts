// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

// @ts-ignore
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
  const Factory = await ethers.getContractFactory("Factory");
  console.log("Upgrading Factory...");
  await upgrades.upgradeProxy(
    "0x9E545E3C0baAB3E08CdfD552C960A1050f373042",
    Factory
  );
  console.log("Factory upgraded");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
