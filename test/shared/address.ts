import { ethers } from "ethers";
import * as crypto from "crypto";

export function generateRandomAddress(): string {
  const privateKey = "0x" + crypto.randomBytes(32).toString("hex");
  const wallet = new ethers.Wallet(privateKey);
  return wallet.address;
}
