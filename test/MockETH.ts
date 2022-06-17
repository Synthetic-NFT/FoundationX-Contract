import { expect } from "chai";
import { MockETH } from "../typechain";
import { beforeEach, it } from "mocha";
import { deployMockETH } from "./shared/constructor";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("#MockETH", function () {
  let ETH: MockETH;
  let owner: SignerWithAddress;
  const name = "sETH";
  const symbol = "$sETH";

  beforeEach(async function () {
    ETH = await deployMockETH(name, symbol);
    [owner] = await ethers.getSigners();
  });

  it("Mint", async function () {
    await ETH.mint(owner.address, ethers.utils.parseEther("9000"));
    expect(await ETH.balanceOf(owner.address)).to.equal(
      ethers.utils.parseEther("9000")
    );
    expect(await ETH.mintable(owner.address)).to.equal(
      ethers.utils.parseEther("1000")
    );
    await expect(
      ETH.mint(owner.address, ethers.utils.parseEther("2000"))
    ).to.be.revertedWith(await ETH.ERR_EXCEED_MINT_LIMIT());
  });
});
