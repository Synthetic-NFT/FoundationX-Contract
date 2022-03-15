import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {generateRandomAddress} from "./shared/address";
import {Liquidation, SafeDecimalMath, Synth} from "../typechain";
import {beforeEach, describe} from "mocha";
import {closeBigNumber} from "./shared/math";

const { BigNumber } = ethers;

describe("Synth", function () {
});
