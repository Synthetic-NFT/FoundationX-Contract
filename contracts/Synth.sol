// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./interfaces/ISynth.sol";
import "./Reserve.sol";
import "./Liquidation.sol";

contract Synth is ISynth, Reserve, Initializable, ERC20Upgradeable, ERC20BurnableUpgradeable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    Liquidation liquidation;
    uint256 totalDebtIssued;
//    Reserve tokenReserve;
//    Liquidation liquidation;
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
//        Reserve _tokenReserve,
        Liquidation _liquidation,
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

//        tokenReserve = _tokenReserve;
        liquidation = _liquidation;
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function mint(address to, uint256 amount) public override onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount)
    internal
    whenNotPaused
    override
    {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _authorizeUpgrade(address newImplementation)
    internal
    onlyRole(UPGRADER_ROLE)
    override
    {}


//    function getSynthPriceToEth() public returns (uint synthPrice){
//        uint synthPrice = 100;
//    }
//
//    function getMinterCollateralRatio(address minter) public returns (uint collateralRatio) {
//        uint synthPrice = getSynthPriceToEth();
//        uint userDebtOfSynth = getMinterDebt(minter);
//
//        if (userDebtOfSynth == 0) {
//            uint collateralRatio = 0;
//        }
//        else {
//            uint userEthDeposited = this.getMinterDeposit(minter);
//            uint collateralRatio =  userEthDeposited.divideDecimalRound(synthPrice.multiplyDecimalRound(userDebtOfSynth));
//        }
//    }

    // TODO: replace this with Oracle
    function getSynthPriceToEth() public returns (uint synthPrice){
        synthPrice = 100;
    }

    function mintSynth(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        mint(minter, amount);
        addMinterDebt(minter, amount);
    }

    function burnSynth(address debtAccount, address burnAccount, uint amount) public onlyRole(MINTER_ROLE) {
        uint existingDebt = getMinterDebt(debtAccount);
        uint amountBurnt = existingDebt < amount ? existingDebt : amount;

        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        burnFrom(burnAccount, amountBurnt);

        // Account for the burnt debt in the cache.
        reduceMinterDebt(debtAccount, amount);
    }

    function liquidateDelinquentAccount(
        address account,
        uint synthAmount,
        address liquidator
    ) external  returns (uint totalRedeemed, uint amountToLiquidate) {
        // Check account is liquidation open
        require(liquidation.isOpenForLiquidation(account), "Account not open for liquidation");

        // require liquidator has enough sUSD
        require(IERC20(address(this)).balanceOf(liquidator) >= synthAmount, "Not enough synthNFTs");

        uint liquidationPenalty = liquidation.getDiscountRate();

        // What is their debt in ETH?
        uint synthPrice = getSynthPriceToEth();
        uint amountSynthDebt = getMinterDebt(account);
        uint debtBalance = synthPrice * amountSynthDebt;
        uint liquidateSynthEthValue = synthPrice * synthAmount;


        uint collateralForAccount = getMinterDeposit(account);
        uint amountToFixCollateralRatio = liquidation.calculateAmountToFixCollateral(debtBalance, collateralForAccount);

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
        burnSynth(account, liquidator, synthLiquidated);
        reduceMinterDeposit(account, totalRedeemed);
        // Remove liquidation flag if amount liquidated fixes ratio
        if (amountToLiquidate == amountToFixCollateralRatio) {
            // Remove liquidation
            liquidation.removeAccountInLiquidation(account);
        }
    }


}