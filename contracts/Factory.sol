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


contract Factory is IFactory, AccessControlUpgradeable, UUPSUpgradeable {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct SynthReserve {
        Synth synth;
        Reserve reserve;
    }

    mapping(string => SynthReserve) availableSynthReserveByName;

    string public constant ERR_USER_UNDER_COLLATERALIZED = "User under collateralized";
    string public constant ERR_NOT_ENOUGH_SYNTH_TO_MINT = "Not enough mintable synth";
    string public constant ERR_BURNING_EXCEED_DEBT = "Burning amount exceeds user debt";
    string public constant ERR_SYNTH_NOT_AVAILABLE = "Synth not available";
    string public constant ERR_INVALID_TARGET_DEPOSIT = "Invalid target deposit";
    string public constant ERR_INVALID_TARGET_COLLATERAL_RATIO = "Invalid target collateral ratio";

    bool locked;

    event Received(address, uint);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize() initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
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

    function listSynth(string memory synthName, Synth synth, Reserve reserve) external onlyRole(DEFAULT_ADMIN_ROLE) {
        availableSynthReserveByName[synthName] = SynthReserve(synth, reserve);
    }

    function delistSynth(string memory synthName) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(availableSynthReserveByName[synthName].synth) != address(0));
        delete availableSynthReserveByName[synthName];
    }

    function checkTargetCollateralRatio(Reserve reserve, uint targetCollateralRatio) private {
        require(targetCollateralRatio >= reserve.getMinCollateralRatio(), ERR_INVALID_TARGET_COLLATERAL_RATIO);
    }

    function userMintSynth(string memory synthName, uint targetCollateralRatio) external payable lock {
        SynthReserve storage synthReserve = availableSynthReserveByName[synthName];
        Synth synth = synthReserve.synth;
        Reserve reserve = synthReserve.reserve;
        require(address(synth) != address(0), ERR_SYNTH_NOT_AVAILABLE);
        checkTargetCollateralRatio(reserve, targetCollateralRatio);
        reserve.addMinterDeposit(msg.sender, msg.value);
        synth.mintSynth(msg.sender, msg.value.divideDecimal(targetCollateralRatio.multiplyDecimal(synth.getSynthPriceToEth())));
    }

    function userBurnSynth(string memory synthName) external payable lock {
        SynthReserve storage synthReserve = availableSynthReserveByName[synthName];
        Synth synth = synthReserve.synth;
        Reserve reserve = synthReserve.reserve;
        require(address(synth) != address(0), ERR_SYNTH_NOT_AVAILABLE);
        internalUserManageSynth(synth, reserve, reserve.getMinCollateralRatio(), 0);
    }

    function userManageSynth(string memory synthName, uint targetCollateralRatio, uint targetDeposit) external payable lock {
        SynthReserve storage synthReserve = availableSynthReserveByName[synthName];
        Synth synth = synthReserve.synth;
        Reserve reserve = synthReserve.reserve;
        require(address(synth) != address(0), ERR_SYNTH_NOT_AVAILABLE);
        internalUserManageSynth(synth, reserve, targetCollateralRatio, targetDeposit);
    }

    function internalUserManageSynth(Synth synth, Reserve reserve, uint targetCollateralRatio, uint targetDeposit) private {
        checkTargetCollateralRatio(reserve, targetCollateralRatio);

        if (msg.value > 0) {
            reserve.addMinterDeposit(msg.sender, msg.value);
            require(reserve.getMinterDeposit(msg.sender) == targetDeposit, ERR_INVALID_TARGET_DEPOSIT);
        }

        uint originalDebt = reserve.getMinterDebt(msg.sender);
        uint targetDebt = targetDeposit.divideDecimal(targetCollateralRatio).divideDecimal(synth.getSynthPriceToEth());
        if (originalDebt > targetDebt) {
            synth.burnSynth(msg.sender, msg.sender, originalDebt.sub(targetDebt));
        } else if (originalDebt < targetDebt) {
            synth.mintSynth(msg.sender, targetDebt - originalDebt);
        }

        uint originalDeposit = reserve.getMinterDeposit(msg.sender);
        if (originalDeposit > targetDeposit) {
            reserve.reduceMinterDeposit(msg.sender, originalDeposit - targetDeposit);
            payable(msg.sender).transfer(originalDeposit - targetDeposit);
        }
    }

    function userLiquidate(string memory synthName, address account, uint synthAmount) external payable lock returns (bool) {
        Synth synth = availableSynthReserveByName[synthName].synth;
        (uint totalRedeemed, uint amountToLiquidate) = synth.liquidateDelinquentAccount(account, synthAmount, msg.sender);
        payable(msg.sender).transfer(totalRedeemed);
        return true;
    }
}
