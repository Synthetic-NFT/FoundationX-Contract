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

contract Synth is ISynth, Reserve, Initializable, ERC20Upgradeable, ERC20BurnableUpgradeable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable, Liquidation {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 totalDebtIssued;
//    Reserve tokenReserve;
//    Liquidation liquidation;
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
//        Reserve _tokenReserve,
//        Liquidation _liquidation,
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
//        liquidation = _liquidation;
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

    function _removeFromDebtRegister(address debtAccount, uint amountBurnt, uint existingDebt, uint totalDebtIssued) internal onlyRole(MINTER_ROLE) {}

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

        // Remove liquidated debt from the ledger
        _removeFromDebtRegister(debtAccount, amountBurnt, existingDebt, totalDebtIssued);

        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        burn(burnAccount, amountBurnt);

        // Account for the burnt debt in the cache.
        reduceMinterDebt(debtAccount, amount);
    }


}