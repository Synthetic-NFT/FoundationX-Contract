// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IVault {
    function getArbitrageurMintedSynth() external view  returns (uint);

    function arbitrageurMintSynth() external payable;

    function arbitrageurBurnSynth(uint synthBurned) external;

    function userLiquidateETH(address account, uint synthAmount) external;
}
