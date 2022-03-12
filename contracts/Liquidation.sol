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

    uint256 liquidationDelay;
    uint256 liquidationPenalty;
    mapping(address => uint256) liquidatableUsers;
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    uint discountRate;


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(uint _discountRate, uint256 _liquidationDelay) initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);

        liquidationDelay = _liquidationDelay;
        discountRate = _discountRate;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADER_ROLE)
        override
    {}

    // Views
    function isOpenForLiquidation(address account) public view returns (bool) {
        return liquidatableUsers[account]>0;
    }
    function getDiscountRate() public view returns (uint) {
        return discountRate;
    }
    // Mutative Functions
    function flagAccountForLiquidation(address account) external {
        liquidatableUsers[account]=1;
    }

    // Restricted: used internally to Synthetix contracts
    function removeAccountInLiquidation(address account) public {
        if(liquidatableUsers[account]>0) {
            delete liquidatableUsers[account];
        }
    }

    function checkAndRemoveAccountInLiquidation(address account) external {
        require(liquidatableUsers[account]>0, "User has not liquidation open");
        if (Reserve.getMinterCollateralRatio(account)> Reserve.getMinCollateralRatio()) {
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

        uint dividend = debtBalance.sub(collateral.multiplyDecimal(ratio));
        uint divisor = unit.sub(unit.add(getLiquidationPenalty()).multiplyDecimal(ratio));

        return dividend.divideDecimal(divisor);
    }



    // owner only
    // TODO: implement this function
    function setLiquidationDelay(uint time) external {
    }

    // TODO: implement this function
    function setLiquidationRatio(uint liquidationRatio) external {

    }

    function setLiquidationPenalty(uint penalty) external {
        liquidationPenalty = penalty;
    }

    function getLiquidationPenalty() public view returns (uint) {
        return liquidationPenalty;
    }
}