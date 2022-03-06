pragma solidity >=0.8.4;

// https://docs.synthetix.io/contracts/source/interfaces/iaddressresolver
interface IReserve {
    function depositToReserve(address account, uint amount) external;
    function withdrawFromReserve(address account, uint amount) external;
}
