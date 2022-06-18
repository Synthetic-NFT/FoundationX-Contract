import { expect } from "chai";
import { MockWETH } from "../typechain";
import { beforeEach, it } from "mocha";
import { deployMockWETH } from "./shared/constructor";
import { ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { getEthBalance } from "./shared/address";

describe("#MockWETH", function () {
  let WETH: MockWETH;
  let owner: SignerWithAddress;
  const name = "WETH";
  const symbol = "WETH";

  beforeEach(async function () {
    WETH = await deployMockWETH(name, symbol);
    [owner] = await ethers.getSigners();
  });

  it("Free mint", async function () {
    await WETH.mintFree(owner.address, ethers.utils.parseEther("900"));
    expect(await WETH.balanceOf(owner.address)).to.equal(
      ethers.utils.parseEther("900")
    );
    expect(await WETH.mintableFree(owner.address)).to.equal(
      ethers.utils.parseEther("100")
    );
    await expect(
      WETH.mintFree(owner.address, ethers.utils.parseEther("200"))
    ).to.be.revertedWith(await WETH.ERR_EXCEED_FREE_MINT_LIMIT());
  });

  it("Deposit and withdraw", async function () {
    await network.provider.send("hardhat_setBalance", [
      owner.address,
      ethers.utils.parseEther("300").toHexString(),
    ]);
    await WETH.connect(owner).deposit({ value: ethers.utils.parseEther("30") });
    expect(await WETH.balanceOf(owner.address)).to.equal(
      ethers.utils.parseEther("30")
    );
    expect(await WETH.totalSupply()).to.equal(ethers.utils.parseEther("30"));
    expect(await getEthBalance(WETH.address)).to.equal(
      ethers.utils.parseEther("30")
    );
    expect(await getEthBalance(owner.address)).to.closeTo(
      ethers.utils.parseEther("270"),
      ethers.utils.parseEther("0.001")
    );
    await WETH.connect(owner).approve(
      WETH.address,
      ethers.utils.parseEther("20")
    );
    await WETH.connect(owner).withdraw(ethers.utils.parseEther("20"));
    expect(await WETH.balanceOf(owner.address)).to.equal(
      ethers.utils.parseEther("10")
    );
    expect(await WETH.totalSupply()).to.equal(ethers.utils.parseEther("10"));
    expect(await getEthBalance(WETH.address)).to.closeTo(
      ethers.utils.parseEther("10"),
      ethers.utils.parseEther("0.001")
    );
    expect(await getEthBalance(owner.address)).to.closeTo(
      ethers.utils.parseEther("290"),
      ethers.utils.parseEther("0.001")
    );
  });
});
