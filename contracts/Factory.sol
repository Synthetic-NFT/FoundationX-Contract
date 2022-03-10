// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./interfaces/IFactory.sol";
import "./Synth.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./libraries/SafeDecimalMath.sol";

contract Factory is IFactory {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    mapping(address => uint) vault;
    mapping(byte32 => Synth) availableSynthsByName;

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

    function userDepositEther() public payable returns (bool) {
        require(msg.sender.balance<=msg.value, "User does not have enough ETH");
        vault[msg.sender] += msg.value;
        return true;
    }

    function getSynthPriceToEth(Synth synth) public returns (uint synthPrice){
        uint synthPrice = 100;
    }

    function getMinterCollateralRatio(address minter, Synth synth) public returns (uint collateralRatio) {
        uint synthPrice = getSynthPriceToEth(synth);
        uint userDebtOfSynth = synth.getMinterDebt(minter);

        if (userDebtOfSynth == 0) {
            uint collateralRatio = 0;
        }
        else {
            uint userEthDeposited = vault[minter];
            uint collateralRatio =  userEthDeposited.divideDecimalRound(synthPrice.multiplyDecimalRound(userDebtOfSynth));
        }
    }

    function remainingMintableSynth(address minter, Synth synth) public {
        uint userCollateralRatio = getMinterCollateralRatio(minter, synth);
        uint minCollateralRatio = synth.getMinCollateralRatio();
        uint diffCollateralRatio = userCollateralRatio - minCollateralRatio;
        require(diffCollateralRatio>0, "User under-collateralized!");
        uint synthToEthPrice = getSynthPriceToEth(synth);
        uint userDepositAmount = vault[minter];
        return userDepositAmount.divideDecimalRound(diffCollateralRatio.multiplyDecimalRound(synthToEthPrice));
    }

    function userMintSynth(byte32 synthName, uint amount) public payable returns (bool) {
        Synth synth = availableSynthsByName[synthName];
        require(address(synthAddress)!=address(0), "Synth not available");
        uint remainingMintableAmount = remainingMintableSynth(msg.sender, synth);
        require(remainingMintableAmount>amount, "Not enough mintable synth remained");
        address(this).transfer(amount);
        synth.mintSynth(msg.sender, amount);
        return true;
    }
    function userBurnSynth(byte32 synthName, uint amount) public payable returns(bool) {
        Synth synth = availableSynthsByName[synthName];
        require(address(synthAddress)!=address(0), "Synth not available");
        require(synth.getMinterDebt(msg.sender)>amount, "Expected burning amount exceeds user debt");
        synth.burnSynth(msg.sender, amount);

        uint userCollateralRatio = getMinterCollateralRatio(minter, synth);
        uint synthPrice = getSynthPriceToEth(synth);
        msg.sender.transfer(userCollateralRatio * amount * synthPrice);

        return true;
    }
    function userLiquidate() public;

}