// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { BigNumber } from "ethers";
import {
  deployFactory,
  deployMockETH,
  deployMockNFT,
  deployOracle,
  deployReserve,
  deploySafeDecimalMath,
  deploySynth,
  deployVault,
} from "../test/shared/constructor";

const { ethers, upgrades, hre } = require("hardhat");
// eslint-disable-next-line node/no-extraneous-require

const tokenNames = ["BoredApeYachtClub", "MutantApeYachtClub", "Otherdeed"];
const tokenSymbols = ["$BAYC", "$MAYC", "$OTHR"];
const NFTAddresses = [
  "0x95401dc811bb5740090279Ba06cfA8fcF6113778",
  "0x36C02dA8a0983159322a80FFE9F24b1acfF8B570",
  "0x2bdCC0de6bE1f7D2ee689a0342D76F52E8EFABa3",
];

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  const [owner] = await ethers.getSigners();
  const MockNFT = await ethers.getContractFactory("MockNFT");
  for (let i = 0; i < NFTAddresses.length; i += 1) {
    console.log("Minting", tokenNames[i]);
    const currNFT = await MockNFT.attach(NFTAddresses[i]);
    await currNFT.safeMint(owner.address, 0);
    const res = await currNFT.tokenOfOwnerByIndex(owner.address, 0);
    console.log(res);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
