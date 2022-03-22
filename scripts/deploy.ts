// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, upgrades } from "hardhat";
import { BigNumber } from "ethers";
import { Oracle } from "../typechain";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const priceStalePeriod: BigNumber = BigNumber.from(10).mul(60);
  const [owner] = await ethers.getSigners();
  console.log("Owner address:", owner.address);

  const Library = await ethers.getContractFactory("SafeDecimalMath");
  const library = await Library.deploy();
  console.log("Library deployed to:", library.address);

  const Oracle = await ethers.getContractFactory("Oracle");
  const oracle = (await upgrades.deployProxy(Oracle, [
    owner.address,
    priceStalePeriod,
  ])) as Oracle;
  console.log("Oracle deployed to:", oracle.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
