// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./interfaces/IReserve.sol";
import "./libraries/SafeDecimalMath.sol";

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";


contract Reserve is IReserve, AccessControlUpgradeable, UUPSUpgradeable {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    mapping(address => uint) minterDebtBalance;
    mapping(address => uint) minterDepositBalance;
    mapping(address => bool) liquidatableUsers;
    uint minCollateralRatio;
    uint256 liquidationPenalty;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        uint _minCollateralRatio,
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
        return minterDepositBalance[minter].divideDecimal(minterDebtBalance[minter].multiplyDecimal(assetPrice));
    }

    function addMinterDebt(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDebtBalance[minter] += amount;
    }

    function reduceMinterDebt(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDebtBalance[minter] -= amount;
    }

    function getMinterDebt(address minter) public view returns (uint) {
        return minterDebtBalance[minter];
    }

    function addMinterDeposit(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDepositBalance[minter] += amount;
    }

    function reduceMinterDeposit(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDepositBalance[minter] -= amount;
    }

    function getMinterDeposit(address minter) public view returns (uint) {
        return minterDepositBalance[minter];
    }

    function isOpenForLiquidation(address account) public view returns (bool) {
        return liquidatableUsers[account];
    }

    // Mutative Functions
    // Note that it's caller's responsibility to verify the collateral ratio of account satisfies the liquidaation criteria.
    function flagAccountForLiquidation(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(getMinterDebt(account) > 0, "Invalid account");
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
