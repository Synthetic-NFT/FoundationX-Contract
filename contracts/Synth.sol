// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


import "./interfaces/ISynth.sol";
import "./Reserve.sol";
import "./interfaces/IOracle.sol";
import "hardhat/console.sol";

contract Synth is ISynth, Initializable, ERC20Upgradeable, ERC20BurnableUpgradeable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    string public constant ERR_LIQUIDATE_ABOVE_MIN_COLLATERAL_RATIO = "Account collateral ratio is above min collateral ratio";
    string public constant ERR_LIQUIDATE_NOT_ENOUGH_SYNTH = "Not enough synthNFTs";

    Reserve reserve;
    IOracle oracle;
    string tokenName;
    string tokenSymbol;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        Reserve _reserve,
        IOracle _oracle,
        string memory _tokenName,
        string memory _tokenSymbol
    ) initializer public {
        __ERC20_init(_tokenName, _tokenSymbol);
        __ERC20Burnable_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);

        reserve = _reserve;
        oracle = _oracle;
        tokenName = _tokenName;
        tokenSymbol = _tokenSymbol;
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal whenNotPaused override {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(UPGRADER_ROLE) override {}

    function getSynthPriceToEth() public view returns (uint synthPrice){
        synthPrice = oracle.getAssetPrice(tokenName);
    }

    function mintTo(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        _mint(minter, amount);
    }

    function mintToWithETH(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        _mint(minter, amount);
        reserve.addMinterDebtETH(minter, amount);
    }

    function burnFromWithETH(address debtAccount, address burnAccount, uint amount) public onlyRole(MINTER_ROLE) {
        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        burnFrom(burnAccount, amount);

        // Account for the burnt debt in the cache.
        reserve.reduceMinterDebtETH(debtAccount, amount);
    }

    function liquidateDelinquentAccount(
        address account,
        uint synthAmount,
        address liquidator
    ) public onlyRole(MINTER_ROLE) returns (uint totalRedeemed, uint amountToLiquidate) {
        // Check account is liquidation open
        uint synthPrice = getSynthPriceToEth();
        uint minterDebt = reserve.getMinterDebtETH(account);
        uint minterCollateralRatio = reserve.getMinterCollateralRatio(account, synthPrice);
        require(minterCollateralRatio <= reserve.getMinCollateralRatio(), ERR_LIQUIDATE_ABOVE_MIN_COLLATERAL_RATIO);

        reserve.flagAccountForLiquidation(account);

        // require liquidator has enough sUSD
        require(IERC20(address(this)).balanceOf(liquidator) >= synthAmount, ERR_LIQUIDATE_NOT_ENOUGH_SYNTH);

        uint liquidationPenalty = reserve.getLiquidationPenalty();

        // What is their debt in ETH?
        uint liquidateSynthEthValue = synthPrice.multiplyDecimal(synthAmount > minterDebt ? minterDebt : synthAmount);

        uint collateralForAccount = reserve.getMinterDepositETH(account);

        uint amountToFixCollateralRatio = reserve.calculateAmountToFixCollateral(synthPrice.multiplyDecimal(minterDebt), collateralForAccount);

        // Cap amount to liquidate to repair collateral ratio based on issuance ratio
        amountToLiquidate = amountToFixCollateralRatio < liquidateSynthEthValue ? amountToFixCollateralRatio : liquidateSynthEthValue;

        // what's the equivalent amount of synth for the amountToLiquidate?
        uint synthLiquidated = amountToLiquidate.divideDecimalRound(synthPrice);

        // Add penalty
        // Note that if minter's collateral ratio is already below discount ratio, we use the current collateral ratio for discount to prevent the collateral ratio after liquidation from dropping below 1.0.
        totalRedeemed = amountToLiquidate.multiplyDecimal(minterCollateralRatio < liquidationPenalty ? minterCollateralRatio : liquidationPenalty);

        // if total SNX to redeem is greater than account's collateral
        // account is under collateralized, liquidate all collateral and reduce sUSD to burn
        if (totalRedeemed > collateralForAccount) {
            // set totalRedeemed to all transferable collateral
            totalRedeemed = collateralForAccount;

            // whats the equivalent sUSD to burn for all collateral less penalty
            synthLiquidated = totalRedeemed.divideDecimal(liquidationPenalty).divideDecimal(synthPrice);
        }

        // burn sUSD from messageSender (liquidator) and reduce account's debt
        burnFromWithETH(account, liquidator, synthLiquidated);
        reserve.reduceMinterDepositETH(account, totalRedeemed);
        // Remove liquidation flag if amount liquidated fixes ratio
        if (amountToLiquidate >= amountToFixCollateralRatio || synthLiquidated >= minterDebt) {
            // Remove liquidation
            reserve.removeAccountInLiquidation(account);
        }
    }
}
