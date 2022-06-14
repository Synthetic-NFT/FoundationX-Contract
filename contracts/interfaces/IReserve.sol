// SPDX-License-Identifier: MIT

pragma solidity >=0.8.4;

interface IReserve {
    function getMinCollateralRatio() public view returns (uint);

    function getMinterCollateralRatio(address minter, uint assetPrice) public view returns (uint);

    function getNumPages() external view returns (uint);

    function getUserReserveInfo(uint pageIndex, uint256 assetPrice) external view returns (address[] memory addresses, uint256[] memory debts, uint256[] memory collateralRatios);

}
