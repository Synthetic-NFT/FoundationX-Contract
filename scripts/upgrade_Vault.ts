// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

// @ts-ignore
const { ethers, upgrades } = require("hardhat");
// eslint-disable-next-line node/no-extraneous-require
const vaultAddresses = ["0x0E801D84Fa97b50751Dbf25036d067dCf18858bF", "0x5f3f1dBD7B74C6B46e8c44f98792A1dAf8d69154", "0xFD471836031dc5108809D173A067e8486B9047A3"];
const WETHAddress = ["0xE2b5bDE7e80f89975f7229d78aD9259b2723d11F"];
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
  const Vault = await ethers.getContractFactory("Vault", {
    libraries: {
      SafeDecimalMath: "0x9e7F7d0E8b8F38e3CF2b3F7dd362ba2e9E82baa4",
    },
  });
  for (let i = 0; i < vaultAddresses.length; i++) {
    console.log("Upgrading Vault...");
    await upgrades.upgradeProxy(
        vaultAddresses[i],
        Vault,
        { unsafeAllowLinkedLibraries: true }
    );
    console.log("Vault upgraded. Setting WETH...");
    const vault = await Vault.attach(vaultAddresses[i]);
    await vault.connect(owner).setWETHAddress(WETHAddress);
  }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
