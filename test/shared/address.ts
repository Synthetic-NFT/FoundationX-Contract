import { BigNumber, ethers } from "ethers";
import * as crypto from "crypto";
import { network } from "hardhat";

export function generateRandomAddress(): [string, string] {
  const privateKey = "0x" + crypto.randomBytes(32).toString("hex");
  const wallet = new ethers.Wallet(privateKey);
  return [wallet.address, wallet.privateKey];
}

export async function getEthBalance(address: string): Promise<BigNumber> {
  return BigNumber.from(
    await network.provider.send("eth_getBalance", [address])
  );
}
