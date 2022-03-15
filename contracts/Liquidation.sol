// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./libraries/SafeDecimalMath.sol";
import "./Reserve.sol";

contract Liquidation is Reserve, AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint256 liquidationPenalty;
    mapping(address => bool) liquidatableUsers;
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(uint256 _liquidationPenalty, uint256 _minCollateralRatio) initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);

        require(_minCollateralRatio >= _liquidationPenalty.add(SafeDecimalMath.UNIT), "Invalid liquidation penalty and min collateral ratio");
        setMinCollateralRatio(_minCollateralRatio);
        setLiquidationPenalty(_liquidationPenalty);
    }

    function _authorizeUpgrade(address newImplementation)
    internal
    onlyRole(UPGRADER_ROLE)
    override
    {}

    // Views
    function isOpenForLiquidation(address account) public view returns (bool) {
        return liquidatableUsers[account];
    }
    // Mutative Functions
    function flagAccountForLiquidation(address account) external {
        liquidatableUsers[account] = true;
    }

    // Restricted: used internally to Synthetix contracts
    function removeAccountInLiquidation(address account) public {
        if (liquidatableUsers[account]) {
            delete liquidatableUsers[account];
        }
    }

    function checkAndRemoveAccountInLiquidation(address account) external {
        require(liquidatableUsers[account], "User has not liquidation open");
        if (Reserve.getMinterCollateralRatio(account) > Reserve.getMinCollateralRatio()) {
            removeAccountInLiquidation(account);
        }
    }

    /**
     * r = target issuance ratio
     * D = debt balance in ETH
     * V = Collateral in ETH
     * P = liquidation penalty, AKA discount ratio
     * Calculates amount of synths = (D - V * r) / (1 - (1 + P) * r)
     */
    function calculateAmountToFixCollateral(uint debtBalance, uint collateral) public view returns (uint) {
        uint ratio = Reserve.getMinCollateralRatio();
        uint unit = SafeDecimalMath.unit();

        uint dividend = collateral.multiplyDecimal(ratio).sub(debtBalance);
        uint divisor = unit.add(getLiquidationPenalty()).multiplyDecimal(ratio).sub(unit);

        return dividend.divideDecimal(divisor);
    }

    function setLiquidationPenalty(uint penalty) public {
        liquidationPenalty = penalty;
    }

    function getLiquidationPenalty() public view returns (uint) {
        return liquidationPenalty;
    }
}