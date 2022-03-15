import { BigNumber } from "ethers";

export function closeBigNumber(
  num1: BigNumber,
  num2: BigNumber,
  precision: BigNumber
): boolean {
  return num1.sub(num2).abs().lte(precision);
}
