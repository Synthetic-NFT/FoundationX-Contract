import { expect } from "chai";
import { MockNFT } from "../typechain";
import { beforeEach, it } from "mocha";
import { BigNumber } from "ethers";
import { deployMockNFT } from "./shared/constructor";
import { ethers } from "hardhat";

describe("#MockNFT", function () {
  let NFT: MockNFT;
  const tokenName = "CryptoPunks";
  const tokenSymbol = "$PUNK";

  beforeEach(async function () {
    NFT = await deployMockNFT(tokenName, tokenSymbol);
  });

  it("Batch token URI", async function () {
    const tokenIds = [BigNumber.from(1), BigNumber.from(4), BigNumber.from(2)];
    const tokenURIs = ["1.png", "4.png", "2.png"];
    await NFT.batchSetTokenURI(tokenIds, tokenURIs);
    expect(await NFT.remainingTokenURI()).to.be.eql([tokenIds, tokenURIs]);

    const [minter] = await ethers.getSigners();
    await NFT.safeMint(minter.address, BigNumber.from(1));
    expect(await NFT.ownerOf(BigNumber.from(1))).to.be.equal(minter.address);
    const [remainingIds, remainingURIs] = await NFT.remainingTokenURI();
    expect(new Set(remainingIds)).to.be.eql(new Set(tokenIds.slice(1)));
    expect(new Set(remainingURIs)).to.be.eql(new Set(tokenURIs.slice(1)));
  });
});
