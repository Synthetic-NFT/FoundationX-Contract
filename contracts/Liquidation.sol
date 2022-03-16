// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./libraries/SafeDecimalMath.sol";
import "./Reserve.sol";


contract Liquidation is AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint256 liquidationPenalty;
    mapping(address => bool) liquidatableUsers;
    Reserve reserve;
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(Reserve _reserve, uint256 _liquidationPenalty) initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);

        reserve = _reserve;
        require(reserve.getMinCollateralRatio() >= _liquidationPenalty, "Invalid liquidation penalty and min collateral ratio");
        setLiquidationPenalty(_liquidationPenalty);
    }

    function _authorizeUpgrade(address newImplementation)
    internal
    onlyRole(UPGRADER_ROLE)
    override
    {}

    function isOpenForLiquidation(address account) public view returns (bool) {
        return liquidatableUsers[account];
    }

    // Mutative Functions
    // Note that it's caller's responsibility to verify the collateral ratio of account satisfies the liquidaation criteria.
    function flagAccountForLiquidation(address account) external {
        require(reserve.getMinterDebt(account) > 0, "Invalid account");
        liquidatableUsers[account] = true;
    }

    // Restricted: used internally to Synthetix contracts
    // Note that it's caller's responsibility to verify the collateral ratio of account satisfies the liquidaation criteria.
    function removeAccountInLiquidation(address account) public {
        if (liquidatableUsers[account]) {
            delete liquidatableUsers[account];
        }
    }

    function checkAndRemoveAccountInLiquidation(address account, uint assetPrice) external {
        require(liquidatableUsers[account], "User has not liquidation open");
        if (reserve.getMinterCollateralRatio(account, assetPrice) > reserve.getMinCollateralRatio()) {
            removeAccountInLiquidation(account);
        }
    }

    /**
     * r = target issuance ratio
     * D = debt balance in ETH
     * V = Collateral in ETH
     * P = liquidation penalty, AKA discount ratio
     * Calculates amount of synths = (D - V * r) / (1 - P * r)
     */
    function calculateAmountToFixCollateral(uint debtBalance, uint collateral) public view returns (uint) {
        uint ratio = reserve.getMinCollateralRatio();
        uint unit = SafeDecimalMath.unit();

        uint dividend = collateral.multiplyDecimal(ratio).sub(debtBalance);
        uint divisor = liquidationPenalty.multiplyDecimal(ratio).sub(unit);

        return dividend.divideDecimal(divisor);
    }

    function setLiquidationPenalty(uint penalty) public onlyRole(DEFAULT_ADMIN_ROLE) {
        liquidationPenalty = penalty;
    }

    function getLiquidationPenalty() public view returns (uint) {
        return liquidationPenalty;
    }
}
