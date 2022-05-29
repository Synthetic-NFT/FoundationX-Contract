import { expect } from "chai";
import { MockNFT } from "../typechain";
import { beforeEach, it } from "mocha";
import { BigNumber } from "ethers";
import { deployMockNFT } from "./shared/constructor";

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
    expect(await NFT.batchTokenURI()).to.be.eql([tokenIds, tokenURIs]);
  });
});
