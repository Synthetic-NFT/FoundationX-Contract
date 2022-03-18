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
        require(!locked, 'LOK');
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

    function userDepositEther(string memory synthName) public payable lock returns (bool) {
        Reserve reserve = availableSynthReserveByName[synthName].reserve;
        require(address(reserve) != address(0), "Synth not available");
        reserve.addMinterDeposit(msg.sender, msg.value);
        return true;
    }

    function getSynthPriceToEth(Synth synth) public view returns (uint synthPrice){
        synthPrice = synth.getSynthPriceToEth();
    }

    function getMinterInvCollateralRatio(address minter, Synth synth, Reserve reserve) public view returns (uint invCollateralRatio) {
        uint userDebtOfSynth = reserve.getMinterDebt(minter);

        if (userDebtOfSynth == 0) {
            invCollateralRatio = 0;
        }
        else {
            uint synthPrice = getSynthPriceToEth(synth);
            invCollateralRatio = SafeDecimalMath.unit().divideDecimal(reserve.getMinterCollateralRatio(minter, synthPrice));
        }
    }

    function remainingMintableSynth(address minter, Synth synth, Reserve reserve) public view returns (uint){
        uint synthToEthPrice = getSynthPriceToEth(synth);
        uint userInvCollateralRatio = getMinterInvCollateralRatio(minter, synth, reserve);
        uint invMinCollateralRatio = SafeDecimalMath.unit().divideDecimal(reserve.getMinCollateralRatio());
        require(invMinCollateralRatio > userInvCollateralRatio, ERR_USER_UNDER_COLLATERALIZED);
        uint userDepositAmount = reserve.getMinterDeposit(minter);
        return userDepositAmount.multiplyDecimal(invMinCollateralRatio.sub(userInvCollateralRatio)).divideDecimal(synthToEthPrice);
    }

    function userMintSynth(string memory synthName, uint amount) public payable lock returns (bool) {
        SynthReserve storage synthReserve = availableSynthReserveByName[synthName];
        Synth synth = synthReserve.synth;
        Reserve reserve = synthReserve.reserve;
        require(address(synth) != address(0), "Synth not available");
        uint remainingMintableAmount = remainingMintableSynth(msg.sender, synth, reserve);
        require(remainingMintableAmount > amount, ERR_NOT_ENOUGH_SYNTH_TO_MINT);
        synth.mintSynth(msg.sender, amount);
        return true;
    }

    function userBurnSynth(string memory synthName, uint amount) public payable lock returns (bool) {
        SynthReserve storage synthReserve = availableSynthReserveByName[synthName];
        Synth synth = synthReserve.synth;
        Reserve reserve = synthReserve.reserve;
        require(address(synth) != address(0), "Synth not available");
        uint minterDebt = reserve.getMinterDebt(msg.sender);
        require(minterDebt > amount, ERR_BURNING_EXCEED_DEBT);
        synth.burnSynth(msg.sender, msg.sender, amount);
        uint transferAmount = amount.divideDecimal(minterDebt).multiplyDecimal(reserve.getMinterDeposit(msg.sender));
        reserve.reduceMinterDeposit(msg.sender, transferAmount);
        payable(msg.sender).transfer(transferAmount);
        return true;
    }

    function userLiquidate(string memory synthName, address account, uint synthAmount) public payable lock returns (bool) {
        Synth synth = availableSynthReserveByName[synthName].synth;
        (uint totalRedeemed, uint amountToLiquidate) = synth.liquidateDelinquentAccount(account, synthAmount, msg.sender);
        payable(msg.sender).transfer(totalRedeemed);
        return true;
    }
}