// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { BigNumber } from "ethers";
import {
  deployFactory,
  deployMockOracle,
  deployReserve,
  deploySafeDecimalMath,
  deploySynth,
  deployVault,
} from "../test/shared/constructor";

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

  const safeDecimalMath = await deploySafeDecimalMath();
  console.log("SafeDecimalMath deployed to:", safeDecimalMath.address);
  const unit = await safeDecimalMath.unit();
  const decimal = await safeDecimalMath.decimals();

  const reserve = await deployReserve(
    safeDecimalMath,
    ethers.utils.parseUnits("1.5", decimal),
    ethers.utils.parseUnits("1.2", decimal)
  );
  console.log("Reserve deployed to:", reserve.address);

  const oracle = await deployMockOracle();
  console.log("Oracle deployed to:", oracle.address);

  const boredApeName = "BoredApeYachtClub";
  const boredApeSymbol = "$BAYC";
  const boredApeAddress = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
  const synth = await deploySynth(
    reserve,
    oracle,
    boredApeName,
    boredApeSymbol
  );
  console.log("Synth deployed to:", synth.address);

  const vault = await deployVault(
    synth,
    reserve,
    boredApeAddress,
    BigNumber.from(0).mul(unit)
  );
  console.log("Vault deployed to:", vault.address);

  const factory = await deployFactory();
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
