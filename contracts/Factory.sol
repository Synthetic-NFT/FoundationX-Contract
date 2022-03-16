// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./interfaces/IFactory.sol";
import "./Synth.sol";
import "./Reserve.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./libraries/SafeDecimalMath.sol";

contract Factory is IFactory {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct SynthReserve {
        Synth synth;
        Reserve reserve;
    }

    mapping(bytes32 => SynthReserve) availableSynthReserveByName;

    event Received(address, uint);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    event CalledFallback(address, uint);

    fallback() external payable {
        emit CalledFallback(msg.sender, msg.value);
    }

    function userDepositEther(bytes32 synthName) public payable returns (bool) {
        Reserve reserve = availableSynthReserveByName[synthName].reserve;
        require(address(reserve) != address(0), "Synth not available");
        require(msg.sender.balance <= msg.value, "User does not have enough ETH");
        payable(this).transfer(msg.value);
        reserve.addMinterDeposit(msg.sender, msg.value);
        return true;
    }

    function getSynthPriceToEth(Synth synth) public returns (uint synthPrice){
        synthPrice = synth.getSynthPriceToEth();
    }

    function getMinterCollateralRatio(address minter, Synth synth, Reserve reserve) public returns (uint collateralRatio) {
        uint synthPrice = getSynthPriceToEth(synth);
        uint userDebtOfSynth = reserve.getMinterDebt(minter);

        if (userDebtOfSynth == 0) {
            collateralRatio = 0;
        }
        else {
            uint userEthDeposited = reserve.getMinterDeposit(minter);
            collateralRatio = userEthDeposited.divideDecimalRound(synthPrice.multiplyDecimalRound(userDebtOfSynth));
        }
    }

    function remainingMintableSynth(address minter, Synth synth, Reserve reserve) public returns (uint){
        uint userCollateralRatio = getMinterCollateralRatio(minter, synth, reserve);
        uint minCollateralRatio = reserve.getMinCollateralRatio();
        uint diffCollateralRatio = userCollateralRatio - minCollateralRatio;
        require(diffCollateralRatio > 0, "User under-collateralized!");
        uint synthToEthPrice = getSynthPriceToEth(synth);
        uint userDepositAmount = reserve.getMinterDeposit(minter);
        return userDepositAmount.divideDecimalRound(diffCollateralRatio.multiplyDecimalRound(synthToEthPrice));
    }

    function userMintSynth(bytes32 synthName, uint amount) public payable returns (bool) {
        SynthReserve storage synthReserve = availableSynthReserveByName[synthName];
        Synth synth = synthReserve.synth;
        Reserve reserve = synthReserve.reserve;
        require(address(synth) != address(0), "Synth not available");
        uint remainingMintableAmount = remainingMintableSynth(msg.sender, synth, reserve);
        require(remainingMintableAmount > amount, "Not enough mintable synth remained");
        synth.mintSynth(msg.sender, amount);
        return true;
    }

    function userBurnSynth(bytes32 synthName, uint amount) public payable returns (bool) {
        SynthReserve storage synthReserve = availableSynthReserveByName[synthName];
        Synth synth = synthReserve.synth;
        Reserve reserve = synthReserve.reserve;
        require(address(synth) != address(0), "Synth not available");
        require(reserve.getMinterDebt(msg.sender) > amount, "Expected burning amount exceeds user debt");
        synth.burnSynth(msg.sender, msg.sender, amount);

        uint userCollateralRatio = getMinterCollateralRatio(msg.sender, synth, reserve);
        uint synthPrice = getSynthPriceToEth(synth);
        uint transferAmount = userCollateralRatio * amount * synthPrice;
        payable(msg.sender).transfer(transferAmount);
        reserve.reduceMinterDeposit(msg.sender, transferAmount);
        return true;
    }

    function userLiquidate(Synth synth, address account, uint synthAmount) public payable returns (bool) {
        (uint totalRedeemed, uint amountToLiquidate) = synth.liquidateDelinquentAccount(account, synthAmount, msg.sender);
        payable(msg.sender).transfer(totalRedeemed);
        return true;
    }
}