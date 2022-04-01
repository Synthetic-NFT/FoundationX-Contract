// SPDX-License-Identifier: MIT

pragma solidity >=0.8.4;

interface IOracle {
    function getAssetPrice(string calldata asset) external view returns (uint);
}
