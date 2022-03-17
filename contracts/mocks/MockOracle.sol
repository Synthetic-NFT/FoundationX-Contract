// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/IOracle.sol";
import "../libraries/SafeDecimalMath.sol";

contract MockOralce is IOracle {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    mapping(string => uint) assetPrices;
    mapping(string => bool) assetSupported;

    function getAssetPrice(string memory asset) external override view returns (uint) {
        require(assetSupported[asset], "Asset is not supported.");
        return assetPrices[asset];
    }

    function setAssetPrice(string memory asset, uint price) external {
        assetSupported[asset] = true;
        assetPrices[asset] = price;
    }
}