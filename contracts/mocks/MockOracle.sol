// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/IOracle.sol";
import "../libraries/SafeDecimalMath.sol";

contract MockOracle is IOracle {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    mapping(string => uint) assetPrices;
    mapping(string => bool) assetSupported;

    function getAssetPrice(string calldata asset) external override view returns (uint) {
        require(assetSupported[asset], "Asset is not supported.");
        return assetPrices[asset];
    }

    function setAssetPrice(string calldata asset, uint price) external {
        assetSupported[asset] = true;
        assetPrices[asset] = price;
    }
}