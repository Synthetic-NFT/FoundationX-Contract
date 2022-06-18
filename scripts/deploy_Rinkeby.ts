// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { BigNumber } from "ethers";
import {
  deployFactory,
  deployMockNFT,
  deployMockWETH,
  deployOracle,
  deployReserve,
  deploySafeDecimalMath,
  deploySynth,
  deployVault,
} from "../test/shared/constructor";

const { ethers, upgrades } = require("hardhat");
// eslint-disable-next-line node/no-extraneous-require

const tokenNames = ["BoredApeYachtClub", "MutantApeYachtClub", "Otherdeed"];
const tokenSymbols = ["$BAYC", "$MAYC", "$OTHR"];

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

  const priceStalePeriod: BigNumber = BigNumber.from(10).mul(60);
  const oracle = await deployOracle(owner.address, priceStalePeriod);
  console.log("Oracle deployed to:", oracle.address);

  const mockWETH = await deployMockWETH("WETH", "WETH");
  console.log("MockWETH deployed to:", mockWETH.address);

  const vaults: Array<string> = [];
  for (let i = 0; i < tokenNames.length; i++) {
    const tokenName = tokenNames[i];
    const tokenSymbol = tokenSymbols[i];

    const reserve = await deployReserve(
      safeDecimalMath,
      ethers.utils.parseUnits("1.5", decimal),
      ethers.utils.parseUnits("1.2", decimal)
    );
    console.log(tokenName, "Reserve deployed to:", reserve.address);

    const NFT = await deployMockNFT(tokenName, tokenSymbol);
    console.log(tokenName, "NFT deployed to:", NFT.address);

    const synth = await deploySynth(reserve, oracle, tokenName, tokenSymbol);
    console.log(tokenName, "Synth deployed to:", synth.address);

    const vault = await deployVault(
      safeDecimalMath,
      synth,
      reserve,
      mockWETH.address,
      NFT.address,
      BigNumber.from(0).mul(unit)
    );
    console.log(tokenName, "Vault deployed to:", vault.address);
    vaults.push(vault.address);
  }

  const factory = await deployFactory();
  console.log("Factory deployed to:", factory.address);

  await factory.listVaults(tokenNames, vaults);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
