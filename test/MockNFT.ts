import { expect } from "chai";
import { MockNFT } from "../typechain";
import { beforeEach, it } from "mocha";
import { BigNumber } from "ethers";
import { deployMockNFT } from "./shared/constructor";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("#MockNFT", function () {
  let NFT: MockNFT;
  let owner: SignerWithAddress;
  const tokenName = "CryptoPunks";
  const tokenSymbol = "$PUNK";

  beforeEach(async function () {
    NFT = await deployMockNFT(tokenName, tokenSymbol);
    [owner] = await ethers.getSigners();
  });

  it("Batch token URI", async function () {
    const tokenIds = [
      BigNumber.from(1),
      BigNumber.from(4),
      BigNumber.from(2),
      BigNumber.from(5),
      BigNumber.from(6),
    ];
    const tokenURIs = ["1.png", "4.png", "2.png", "5.png", "6.png"];
    await NFT.batchSetTokenURI(tokenIds, tokenURIs);
    await NFT.connect(owner).setPageSize(3);
    expect(await NFT.tokenURINumPages()).to.equal(BigNumber.from(2));
    expect(await NFT.remainingTokenURI(BigNumber.from(0))).to.eql([
      [BigNumber.from(1), BigNumber.from(4), BigNumber.from(2)],
      ["1.png", "4.png", "2.png"],
    ]);
    expect(await NFT.remainingTokenURI(BigNumber.from(1))).to.eql([
      [BigNumber.from(5), BigNumber.from(6)],
      ["5.png", "6.png"],
    ]);

    const [minter] = await ethers.getSigners();
    await NFT.safeMint(minter.address, BigNumber.from(1));
    await NFT.safeMint(minter.address, BigNumber.from(5));
    expect(await NFT.ownerOf(BigNumber.from(1))).to.equal(minter.address);
    expect(await NFT.ownerOf(BigNumber.from(5))).to.equal(minter.address);
    expect(await NFT.tokenURINumPages()).to.equal(BigNumber.from(1));
    const [remainingIds, remainingURIs] = await NFT.remainingTokenURI(0);
    expect(new Set(remainingIds)).to.eql(
      new Set([BigNumber.from(4), BigNumber.from(2), BigNumber.from(6)])
    );
    expect(new Set(remainingURIs)).to.eql(new Set(["4.png", "2.png", "6.png"]));

    expect(await NFT.tokenURI(BigNumber.from(2))).to.equal("2.png");
  });
});
