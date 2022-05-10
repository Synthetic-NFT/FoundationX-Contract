// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./interfaces/IReserve.sol";
import "./libraries/SafeDecimalMath.sol";

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";


contract Reserve is IReserve, AccessControlUpgradeable, UUPSUpgradeable {

    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using EnumerableSet for EnumerableSet.UintSet;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    mapping(address => uint) minterDebtBalanceETH;
    mapping(address => uint) minterDepositBalanceETH;
    mapping(address => EnumerableSet.UintSet) minterDepositBalanceNFT;
    mapping(address => bool) liquidatableUsers;

    uint256 minCollateralRatio;
    uint256 liquidationPenalty;

    string public constant ERR_NFT_NOT_OWNED_BY_MINTER = "NFT not owned by minter";
    string public constant ERR_NOT_ENOUGH_DEBT = "Not enough debt";
    string public constant ERR_NOT_ENOUGH_DEPOSIT = "Not enough deposit";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        uint256 _minCollateralRatio,
        uint256 _liquidationPenalty
    ) initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);

        require(_minCollateralRatio >= _liquidationPenalty, "Invalid liquidation penalty and min collateral ratio");

        setMinCollateralRatio(_minCollateralRatio);
        setLiquidationPenalty(_liquidationPenalty);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(UPGRADER_ROLE) override {}

    function setMinCollateralRatio(uint collateralRatio) public onlyRole(DEFAULT_ADMIN_ROLE) {
        minCollateralRatio = collateralRatio;
    }

    function getMinCollateralRatio() public view returns (uint) {
        return minCollateralRatio;
    }

    function setLiquidationPenalty(uint penalty) public onlyRole(DEFAULT_ADMIN_ROLE) {
        liquidationPenalty = penalty;
    }

    function getLiquidationPenalty() public view returns (uint) {
        return liquidationPenalty;
    }

    function getMinterCollateralRatio(address minter, uint assetPrice) public view returns (uint) {
        return minterDepositBalanceETH[minter].divideDecimal(minterDebtBalanceETH[minter].multiplyDecimal(assetPrice));
    }

    function addMinterDebtETH(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDebtBalanceETH[minter] += amount;
    }

    function reduceMinterDebtETH(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        require(minterDebtBalanceETH[minter] >= amount, ERR_NOT_ENOUGH_DEBT);
        minterDebtBalanceETH[minter] -= amount;
    }

    function getMinterDebtETH(address minter) public view returns (uint) {
        return minterDebtBalanceETH[minter];
    }

    function getMinterDebtNFT(address minter) public view returns (uint) {
        EnumerableSet.UintSet storage minterHoldings = minterDepositBalanceNFT[minter];
        return minterHoldings.length().mul(SafeDecimalMath.unit());
    }

    function getMinterDebt(address minter) public view returns (uint) {
        return getMinterDebtETH(minter) + getMinterDebtNFT(minter);
    }

    function addMinterDepositETH(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDepositBalanceETH[minter] += amount;
    }

    function reduceMinterDepositETH(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        require(minterDepositBalanceETH[minter] >= amount, ERR_NOT_ENOUGH_DEPOSIT);
        minterDepositBalanceETH[minter] -= amount;
    }

    function getMinterDepositETH(address minter) public view returns (uint) {
        return minterDepositBalanceETH[minter];
    }

    function addMinterDepositNFT(address minter, uint tokenId) public onlyRole(MINTER_ROLE) {
        minterDepositBalanceNFT[minter].add(tokenId);
    }

    function reduceMinterDepositNFT(address minter, uint tokenId) public onlyRole(MINTER_ROLE) {
        require(minterDepositBalanceNFT[minter].contains(tokenId), ERR_NFT_NOT_OWNED_BY_MINTER);
        minterDepositBalanceNFT[minter].remove(tokenId);
    }

    function getMinterDepositNFT(address minter) public view returns (uint[] memory) {
        EnumerableSet.UintSet storage minterHoldings = minterDepositBalanceNFT[minter];
        uint[] memory tokenIds = new uint[](minterHoldings.length());
        for (uint i = 0; i < tokenIds.length; i++) {
            tokenIds[i] = minterHoldings.at(i);
        }
        return tokenIds;
    }

    function isOpenForLiquidation(address account) public view returns (bool) {
        return liquidatableUsers[account];
    }

    // Mutative Functions
    // Note that it's caller's responsibility to verify the collateral ratio of account satisfies the liquidaation criteria.
    function flagAccountForLiquidation(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(getMinterDebtETH(account) > 0, "Invalid account");
        liquidatableUsers[account] = true;
    }

    // Restricted: used internally to Synthetix contracts
    // Note that it's caller's responsibility to verify the collateral ratio of account satisfies the liquidaation criteria.
    function removeAccountInLiquidation(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (liquidatableUsers[account]) {
            delete liquidatableUsers[account];
        }
    }

    function checkAndRemoveAccountInLiquidation(address account, uint assetPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(liquidatableUsers[account], "User has not liquidation open");
        if (getMinterCollateralRatio(account, assetPrice) > minCollateralRatio) {
            removeAccountInLiquidation(account);
        }
    }

    /**
     * r = target issuance ratio
     * D = debt balance in ETH
     * V = Collateral in ETH
     * P = liquidation penalty, AKA discount ratio
     * Calculates amount of synths = (V * r - D) / (r - P)
     */
    function calculateAmountToFixCollateral(uint debtBalance, uint collateral) public view returns (uint) {
        uint ratio = minCollateralRatio;
        uint unit = SafeDecimalMath.unit();

        uint dividend = debtBalance.multiplyDecimal(ratio).sub(collateral);
        uint divisor = ratio.sub(liquidationPenalty);

        return dividend.divideDecimal(divisor);
    }
}
