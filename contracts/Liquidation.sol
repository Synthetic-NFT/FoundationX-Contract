// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./libraries/SafeDecimalMath.sol";

contract Liquidation is AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint256 liquidationDelay;
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

    // Views
    function isOpenForLiquidation(address account) external view returns (bool) {
        return liquidatableUsers[accound]>0;
    }
    function getDiscountRate() external view returns (bool) {
        return discountRate;
    }
    // Mutative Functions
    function flagAccountForLiquidation(address account) external {
        liquidatableUsers[account]=true;
    }

    // Restricted: used internally to Synthetix contracts
    function removeAccountInLiquidation(address account) external {
        if(liquidatableUsers[account]>0) {
            delete liquidatableUsers[account];
        }
    }

    function checkAndRemoveAccountInLiquidation(address account) external {
        require(liquidatableUsers[account]>0, "User has not liquidation open");
        if (super.getMinterCollateralRatio(account)>super.getMinCollateralRatio()) {
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
    function calculateAmountToFixCollateral(uint debtBalance, uint collateral) external view returns (uint) {
        uint ratio = super.getMinCollateralRatio();
        uint unit = SafeDecimalMath.unit();

        uint dividend = debtBalance.sub(collateral.multiplyDecimal(ratio));
        uint divisor = unit.sub(unit.add(getLiquidationPenalty()).multiplyDecimal(ratio));

        return dividend.divideDecimal(divisor);
    }

    function liquidateDelinquentAccount(
        address account,
        uint synthAmount,
        address liquidator
    ) external  returns (uint totalRedeemed, uint amountToLiquidate) {
        // Check account is liquidation open
        require(isOpenForLiquidation(account), "Account not open for liquidation");

        // require liquidator has enough sUSD
        require(IERC20(address(super)).balanceOf(liquidator) >= synthAmount, "Not enough synthNFTs");

        uint liquidationPenalty = getDiscountRate();

        // What is their debt in ETH?
        uint synthPrice = super.getSynthPriceToEth();
        uint amountSynthDebt = super.getMinterDebt(account);
        uint debtBalance = synthPrice * amountSynthDebt;
        uint liquidateSynthEthValue = synthPrice * synthAmount;


        uint collateralForAccount = super.getMinterDeposit(account);
        uint amountToFixCollateralRatio = calculateAmountToFixCollateral(debtBalance, collateralForAccount);

        // Cap amount to liquidate to repair collateral ratio based on issuance ratio
        amountToLiquidate = amountToFixCollateralRatio < liquidateSynthEthValue ? amountToFixCollateralRatio : liquidateSynthEthValue;

        // what's the equivalent amount of synth for the amountToLiquidate?
        uint synthLiquidated = amountToLiquidate.divideDecimalRound(synthPrice);

        // Add penalty
        totalRedeemed = synthLiquidated.multiplyDecimal(SafeDecimalMath.unit().add(liquidationPenalty));

        // if total SNX to redeem is greater than account's collateral
        // account is under collateralised, liquidate all collateral and reduce sUSD to burn
        if (totalRedeemed > collateralForAccount) {
            // set totalRedeemed to all transferable collateral
            totalRedeemed = collateralForAccount;

            // whats the equivalent sUSD to burn for all collateral less penalty
            synthLiquidated = totalRedeemed.divideDecimal(SafeDecimalMath.unit().add(liquidationPenalty)).divideDecimal(synthPrice);
        }

        // burn sUSD from messageSender (liquidator) and reduce account's debt
        super.burnSynth(account, liquidator, synthLiquidated);
        super.reduceMinterDeposit(minter, totalRedeemed);
    // Remove liquidation flag if amount liquidated fixes ratio
        if (amountToLiquidate == amountToFixRatio) {
            // Remove liquidation
            removeAccountInLiquidation(account);
        }
    }

    // owner only
    function setLiquidationDelay(uint time) external;

    function setLiquidationRatio(uint liquidationRatio) external;

    function setLiquidationPenalty(uint penalty) external;

}