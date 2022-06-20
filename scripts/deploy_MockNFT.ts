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
const vaultAddresses = ["0x0E801D84Fa97b50751Dbf25036d067dCf18858bF", "0x5f3f1dBD7B74C6B46e8c44f98792A1dAf8d69154", "0xFD471836031dc5108809D173A067e8486B9047A3"];
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
  const Vault = await ethers.getContractFactory("Vault", {
    libraries: {
      SafeDecimalMath: safeDecimalMath.address,
    },
  });
  for (let i = 0; i < tokenNames.length; i++) {
    const tokenName = tokenNames[i];
    const tokenSymbol = tokenSymbols[i];
    const vault = await Vault.attach(vaultAddresses[i]);
    const NFT = await deployMockNFT(tokenName, tokenSymbol);
    console.log(tokenName, "NFT deployed to:", NFT.address);
    await vault.connect(owner).setNFTAddress(NFT.address);
  }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
