// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./interfaces/IFactory.sol";
import "./Synth.sol";
import "./Reserve.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "./libraries/SafeDecimalMath.sol";
import "hardhat/console.sol";


contract Vault is AccessControlUpgradeable, UUPSUpgradeable {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    Synth synth;
    Reserve reserve;

    string public constant ERR_USER_UNDER_COLLATERALIZED = "User under collateralized";
    string public constant ERR_NOT_ENOUGH_SYNTH_TO_MINT = "Not enough mintable synth";
    string public constant ERR_BURNING_EXCEED_DEBT = "Burning amount exceeds user debt";
    string public constant ERR_INVALID_TARGET_DEPOSIT = "Invalid target deposit";
    string public constant ERR_INVALID_TARGET_COLLATERAL_RATIO = "Invalid target collateral ratio";

    bool locked;

    event Received(address, uint);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(Synth _synth, Reserve _reserve) initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        synth = _synth;
        reserve = _reserve;
        locked = false;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    modifier lock() {
        require(!locked, "LOK");
        locked = true;
        _;
        locked = false;
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(DEFAULT_ADMIN_ROLE) override {}

    function getReserve() external view returns (Reserve) {
        return reserve;
    }

    function getSynth() external view returns (Synth) {
        return synth;
    }

    function checkTargetCollateralRatio(uint targetCollateralRatio) private {
        require(targetCollateralRatio >= reserve.getMinCollateralRatio(), ERR_INVALID_TARGET_COLLATERAL_RATIO);
    }

    function userMintSynth(uint targetCollateralRatio) external payable lock {
        checkTargetCollateralRatio(targetCollateralRatio);
        reserve.addMinterDepositETH(msg.sender, msg.value);
        synth.mintSynth(msg.sender, msg.value.divideDecimal(targetCollateralRatio.multiplyDecimal(synth.getSynthPriceToEth())));
    }

    function userBurnSynth() external payable lock {
        internalUserManageSynth(reserve.getMinCollateralRatio(), 0);
    }

    function userManageSynth(uint targetCollateralRatio, uint targetDeposit) external payable lock {
        internalUserManageSynth(targetCollateralRatio, targetDeposit);
    }

    function internalUserManageSynth(uint targetCollateralRatio, uint targetDeposit) private {
        checkTargetCollateralRatio(targetCollateralRatio);

        if (msg.value > 0) {
            reserve.addMinterDepositETH(msg.sender, msg.value);
            require(reserve.getMinterDepositETH(msg.sender) == targetDeposit, ERR_INVALID_TARGET_DEPOSIT);
        }

        uint originalDebt = reserve.getMinterDebtETH(msg.sender);
        uint targetDebt = targetDeposit.divideDecimal(targetCollateralRatio).divideDecimal(synth.getSynthPriceToEth());
        if (originalDebt > targetDebt) {
            synth.burnSynth(msg.sender, msg.sender, originalDebt.sub(targetDebt));
        } else if (originalDebt < targetDebt) {
            synth.mintSynth(msg.sender, targetDebt - originalDebt);
        }

        uint originalDeposit = reserve.getMinterDepositETH(msg.sender);
        if (originalDeposit > targetDeposit) {
            reserve.reduceMinterDepositETH(msg.sender, originalDeposit - targetDeposit);
            payable(msg.sender).transfer(originalDeposit - targetDeposit);
        }
    }

    function userLiquidate(address account, uint synthAmount) external payable lock returns (bool) {
        (uint totalRedeemed, uint amountToLiquidate) = synth.liquidateDelinquentAccount(account, synthAmount, msg.sender);
        payable(msg.sender).transfer(totalRedeemed);
        return true;
    }
}
