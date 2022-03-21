import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Oracle, Reserve, SafeDecimalMath } from "../typechain";
import { beforeEach, it } from "mocha";
import { BigNumber } from "ethers";

describe("#Oracle", function () {
  let librarySafeDecimalMath: SafeDecimalMath;
  let oracle: Oracle;
  let unit: BigNumber;
  let blockTimestampBefore: number;
  const priceStalePeriod: BigNumber = BigNumber.from(10).mul(60);

  beforeEach(async function () {
    const Library = await ethers.getContractFactory("SafeDecimalMath");
    librarySafeDecimalMath = await Library.deploy();
    unit = await librarySafeDecimalMath.UNIT();
    const [owner] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("Oracle");
    oracle = (await upgrades.deployProxy(Oracle, [
      owner.address,
      priceStalePeriod,
    ])) as Oracle;
    const blockNumBefore = await ethers.provider.getBlockNumber();
    blockTimestampBefore = (await ethers.provider.getBlock(blockNumBefore))
      .timestamp;
  });

  it("Update prices too far", async function () {
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      blockTimestampBefore + 1,
    ]);
    await expect(
      oracle.updatePrices(
        ["Token0", "Token1"],
        [BigNumber.from(1).mul(unit), BigNumber.from(2).mul(unit)],
        BigNumber.from(blockTimestampBefore).add(priceStalePeriod).add(2)
      )
    ).to.be.revertedWith(await oracle.ERR_TOO_FAR_INTO_FUTURE());
  });

  it("Update prices success", async function () {
    const token0 = "Token0";
    const token1 = "Token1";
    await oracle.updatePrices(
      [token0],
      [BigNumber.from(1).mul(unit)],
      BigNumber.from(blockTimestampBefore + 1)
    );
    await oracle.updatePrices(
      [token0, token1],
      [BigNumber.from(2).mul(unit), BigNumber.from(3).mul(unit)],
      BigNumber.from(blockTimestampBefore)
    );
    expect(await oracle.getAssetPrice(token0)).to.equal(
      BigNumber.from(1).mul(unit)
    );
    expect(await oracle.getAssetPrice(token1)).to.equal(
      BigNumber.from(3).mul(unit)
    );
  });

  it("Get price stale", async function () {
    const token0 = "Token0";
    await oracle.updatePrices(
      [token0],
      [BigNumber.from(1).mul(unit)],
      BigNumber.from(blockTimestampBefore).sub(priceStalePeriod)
    );
    const blockNum = await ethers.provider.getBlockNumber();
    const blockTimestamp = (await ethers.provider.getBlock(blockNum)).timestamp;
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      blockTimestamp + 1,
    ]);
    await expect(oracle.getAssetPrice(token0)).to.be.revertedWith(
      await oracle.ERR_PRICE_STALE()
    );
  });
});
