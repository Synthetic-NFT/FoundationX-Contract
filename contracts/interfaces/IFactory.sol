pragma solidity >=0.8.4;

import "./ISynth.sol";

// https://docs.synthetix.io/contracts/source/interfaces/iaddressresolver
interface IFactory {
    function availableCurrencyKeys() external view returns (bytes32[] memory);
    function availableSynthCount() external view returns (uint);
    function availableSynths(uint index) external view returns (ISynth);



    function userMintSynth() public;
    function userBurnSynth() public;
    function userLiquidate() public;

}
