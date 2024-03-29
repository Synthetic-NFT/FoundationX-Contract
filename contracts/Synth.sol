// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


import "./interfaces/ISynth.sol";
import "./Reserve.sol";
import "./interfaces/IOracle.sol";
import "hardhat/console.sol";

contract Synth is ISynth, Initializable, ERC20Upgradeable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    string public constant ERR_LIQUIDATE_ABOVE_MIN_COLLATERAL_RATIO = "Account collateral ratio is above min collateral ratio";
    string public constant ERR_LIQUIDATE_NOT_ENOUGH_SYNTH = "Not enough synthNFTs";

    Reserve reserve;
    IOracle oracle;
    string public tokenName;
    string public tokenSymbol;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        Reserve _reserve,
        IOracle _oracle,
        string memory _tokenName,
        string memory _tokenSymbol
    ) initializer public {
        __ERC20_init(_tokenName, _tokenSymbol);
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

    function mint(address account, uint amount) public onlyRole(MINTER_ROLE) {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public onlyRole(MINTER_ROLE) {
        _burn(account, amount);
    }

    // Mint synthetic token and add minter's debt.
    function mintWithETH(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        _mint(minter, amount);
        reserve.addMinterDebtETH(minter, amount);
    }

    // Burn synthetic token and reduce minter's debt.
    function burnFromWithETH(address debtAccount, address burnAccount, uint amount) public onlyRole(MINTER_ROLE) {
        // synth.burn does a safe subtraction on balance (so it will revert if there are not enough synths).
        burn(burnAccount, amount);

        // Account for the burnt debt in the cache.
        reserve.reduceMinterDebtETH(debtAccount, amount);
    }

    function liquidateDelinquentAccount(address account, uint synthAmount, address liquidator) public onlyRole(MINTER_ROLE) returns (uint totalRedeemed, uint amountToLiquidate) {
        uint synthPrice = getSynthPriceToEth();
        uint minterCollateralRatio = reserve.getMinterCollateralRatio(account, synthPrice);
        require(minterCollateralRatio <= reserve.getMinCollateralRatio(), ERR_LIQUIDATE_ABOVE_MIN_COLLATERAL_RATIO);
        reserve.flagAccountForLiquidation(account);

        require(IERC20(address(this)).balanceOf(liquidator) >= synthAmount, ERR_LIQUIDATE_NOT_ENOUGH_SYNTH);

        uint minterDebt = reserve.getMinterDebtETH(account);
        uint minterDeposit = reserve.getMinterDepositETH(account);
        uint liquidateSynthEthValue = synthPrice.multiplyDecimal(synthAmount > minterDebt ? minterDebt : synthAmount);

        uint liquidationPenalty = reserve.getLiquidationPenalty();
        amountToLiquidate = minterDebt < synthAmount ? minterDebt : synthAmount;
        totalRedeemed = amountToLiquidate.multiplyDecimal(minterCollateralRatio < liquidationPenalty ? minterCollateralRatio : liquidationPenalty).multiplyDecimal(synthPrice);
        // Account for numerical errors.
        if (totalRedeemed > minterDeposit) {
            totalRedeemed = minterDeposit;
        }

        // Burn synth from liquidator and reduce minter's debt
        reserve.reduceMinterDepositETH(account, totalRedeemed);
        burnFromWithETH(account, liquidator, amountToLiquidate);

        // Remove liquidation flag if amount liquidated fixes ratio
        if (reserve.getMinterDebt(account) == 0 || reserve.getMinterCollateralRatio(account, synthPrice) > reserve.getMinCollateralRatio()) {
            // Remove liquidation
            reserve.removeAccountInLiquidation(account);
        }
    }
}
