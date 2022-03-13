import { expect } from "chai";
import { ethers } from "hardhat";
import { generateRandomAddress } from "./shared/address";
import { Liquidation, SafeDecimalMath } from "../typechain";
import { beforeEach } from "mocha";

describe("Liquidation", function () {
  let liquidation: Liquidation;

  beforeEach(async function () {
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    const library = await Library.deploy();
    const Liquidation = await ethers.getContractFactory("Liquidation", {
      libraries: {
        SafeDecimalMath: library.address,
      },
    });
    liquidation = await Liquidation.deploy();
  });

  it("Set and unset liquidation", async function () {
    const randomAddress1 = generateRandomAddress();
    const flagLiquidationTx = await liquidation.flagAccountForLiquidation(
      randomAddress1
    );
    await flagLiquidationTx.wait();
    expect(await liquidation.isOpenForLiquidation(randomAddress1)).to.equal(
      true
    );
    const removeLiquidationTx = await liquidation.removeAccountInLiquidation(
      randomAddress1
    );
    await removeLiquidationTx.wait();
    expect(await liquidation.isOpenForLiquidation(randomAddress1)).to.equal(
      false
    );
  });
});
