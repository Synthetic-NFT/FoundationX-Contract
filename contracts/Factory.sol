// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./interfaces/IFactory.sol";
import "./Synth.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./libraries/SafeDecimalMath.sol";

contract Factory is IFactory {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    mapping(bytes32 => Synth) availableSynthsByName;

    event Received(address, uint);
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    event CalledFallback(address, uint);
    fallback() external payable {
        emit CalledFallback(msg.sender, msg.value);
    }

//    function userStakeCollateral(uint collateralAmount, address collateralAddress) public returns (bool) {
//        require(collateralAddress != address(0), "Collateral does not exist");
//        require(ERC20(collateralAddress).balanceOf(msg.sender)<=collateralAmount, "User does not have enough balance");
//
//        return true;
//    }

    function userDepositEther(bytes32 synthName) public payable returns (bool) {
        Synth synth = availableSynthsByName[synthName];
        require(address(synth)!=address(0), "Synth not available");
        require(msg.sender.balance<=msg.value, "User does not have enough ETH");
        payable(this).transfer(msg.value);
//        vault[msg.sender] += msg.value;
        synth.addMinterDeposit(msg.sender, msg.value);
        return true;
    }

    function getSynthPriceToEth(Synth synth) public returns (uint synthPrice){
        synthPrice = synth.getSynthPriceToEth();
    }

    function getMinterCollateralRatio(address minter, Synth synth) public returns (uint collateralRatio) {
        uint synthPrice = getSynthPriceToEth(synth);
        uint userDebtOfSynth = synth.getMinterDebt(minter);

        if (userDebtOfSynth == 0) {
            collateralRatio = 0;
        }
        else {
            uint userEthDeposited = synth.getMinterDeposit(minter);
            collateralRatio =  userEthDeposited.divideDecimalRound(synthPrice.multiplyDecimalRound(userDebtOfSynth));
        }
    }

    function remainingMintableSynth(address minter, Synth synth) public returns(uint){
        uint userCollateralRatio = getMinterCollateralRatio(minter, synth);
        uint minCollateralRatio = synth.getMinCollateralRatio();
        uint diffCollateralRatio = userCollateralRatio - minCollateralRatio;
        require(diffCollateralRatio>0, "User under-collateralized!");
        uint synthToEthPrice = getSynthPriceToEth(synth);
        uint userDepositAmount = synth.getMinterDeposit(minter);
        return userDepositAmount.divideDecimalRound(diffCollateralRatio.multiplyDecimalRound(synthToEthPrice));
    }

    function userMintSynth(bytes32 synthName, uint amount) public payable returns (bool) {
        Synth synth = availableSynthsByName[synthName];
        require(address(synth)!=address(0), "Synth not available");
        uint remainingMintableAmount = remainingMintableSynth(msg.sender, synth);
        require(remainingMintableAmount>amount, "Not enough mintable synth remained");
        synth.mintSynth(msg.sender, amount);
        return true;
    }
    function userBurnSynth(bytes32 synthName, uint amount) public payable returns(bool) {
        Synth synth = availableSynthsByName[synthName];
        require(address(synth)!=address(0), "Synth not available");
        require(synth.getMinterDebt(msg.sender)>amount, "Expected burning amount exceeds user debt");
        synth.burnSynth(msg.sender, msg.sender, amount);

        uint userCollateralRatio = getMinterCollateralRatio(msg.sender, synth);
        uint synthPrice = getSynthPriceToEth(synth);
        uint transferAmount = userCollateralRatio * amount * synthPrice;
        payable(msg.sender).transfer(transferAmount);
        synth.reduceMinterDeposit(msg.sender, transferAmount);
        return true;
    }

    function userLiquidate(Synth synth, address account, uint synthAmount) public payable returns(bool) {
        (uint totalRedeemed, uint amountToLiquidate) = synth.liquidateDelinquentAccount(account, synthAmount, msg.sender);
        payable(msg.sender).transfer(totalRedeemed);
        return true;
    }
}