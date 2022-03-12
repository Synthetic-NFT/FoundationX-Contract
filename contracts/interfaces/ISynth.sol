pragma solidity >=0.8.4;

// https://docs.synthetix.io/contracts/source/interfaces/isynth
interface ISynth {
    // Restricted: used internally to Synthetix
//    function burn(address account, uint amount) external;
    function mint(address account, uint amount) external;
//    function liquidate(address account, uint amount) external;
}
