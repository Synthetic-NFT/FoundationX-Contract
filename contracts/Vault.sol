// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./interfaces/IFactory.sol";
import "./Synth.sol";
import "./Reserve.sol";
import "./interfaces/IVault.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "./libraries/SafeDecimalMath.sol";
import "hardhat/console.sol";
import "./Greeter.sol";


contract Vault is IVault, AccessControlUpgradeable, UUPSUpgradeable, ERC721HolderUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using EnumerableSet for EnumerableSet.UintSet;

    bytes32 public constant ARBITRAGEUR_ROLE = keccak256("ARBITRAGEUR_ROLE");

    Synth public synth;
    Reserve public reserve;
    uint arbitrageurBurnedSynth;

    address public NFTAddress;
    EnumerableSet.UintSet holdings;
    mapping(uint => address) public NFTDepositer;
    mapping(uint => uint) public NFTDepositTimes;

    uint public lockingPeriod;

    string public constant ERR_NOT_ENOUGH_ETH_TO_REDEEM = "Not enough ETH to redeem";
    string public constant ERR_NOT_ENOUGH_SYNTH_TO_MINT = "Not enough Synth to mint";
    string public constant ERR_INVALID_TARGET_DEPOSIT = "Invalid target deposit";
    string public constant ERR_INVALID_TARGET_COLLATERAL_RATIO = "Invalid target collateral ratio";
    string public constant ERR_NFT_ALREADY_IN_HOLDINGS = "NFT already in holdings";
    string public constant ERR_NFT_NOT_IN_HOLDINGS = "NFT not in holdings";
    string public constant ERR_NOT_NFT_OWNER = "Not the NFT owner";
    string public constant ERR_WITHIN_LOCKING_PERIOD = "Within locking period";

    bool locked;

    event Received(address, uint);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(Synth _synth, Reserve _reserve, address _NFTAddress, uint _lockingPeriod) initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ARBITRAGEUR_ROLE, msg.sender);
        synth = _synth;
        reserve = _reserve;
        NFTAddress = _NFTAddress;
        lockingPeriod = _lockingPeriod;
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

    function checkTargetCollateralRatio(uint targetCollateralRatio) private {
        require(targetCollateralRatio >= reserve.getMinCollateralRatio(), ERR_INVALID_TARGET_COLLATERAL_RATIO);
    }

    function getArbitrageurMintedSynth() external view override onlyRole(ARBITRAGEUR_ROLE) returns (uint) {
        return arbitrageurBurnedSynth;
    }

    function arbitrageurMintSynth() external override onlyRole(ARBITRAGEUR_ROLE) payable lock {
        uint synthMinted = msg.value.divideDecimal(synth.getSynthPriceToEth());
        require(synthMinted <= arbitrageurBurnedSynth, ERR_NOT_ENOUGH_SYNTH_TO_MINT);
        synth.mint(msg.sender, synthMinted);
    }

    function arbitrageurBurnSynth(uint synthBurned) override external onlyRole(ARBITRAGEUR_ROLE) lock {
        uint ethRedeemed = synthBurned.multiplyDecimal(synth.getSynthPriceToEth());
        require(address(this).balance >= ethRedeemed, ERR_NOT_ENOUGH_ETH_TO_REDEEM);
        arbitrageurBurnedSynth += synthBurned;
        synth.burn(msg.sender, synthBurned);
        payable(msg.sender).transfer(ethRedeemed);
    }

    function userMintSynthETH(uint targetCollateralRatio) external payable lock {
        checkTargetCollateralRatio(targetCollateralRatio);
        reserve.addMinterDepositETH(msg.sender, msg.value);
        synth.mintWithETH(msg.sender, msg.value.divideDecimal(targetCollateralRatio.multiplyDecimal(synth.getSynthPriceToEth())));
    }

    function userBurnSynthETH() external lock {
        internalUserManageSynthETH(reserve.getMinCollateralRatio(), 0);
    }

    function userManageSynthETH(uint targetCollateralRatio, uint targetDeposit) external payable lock {
        internalUserManageSynthETH(targetCollateralRatio, targetDeposit);
    }

    function internalUserManageSynthETH(uint targetCollateralRatio, uint targetDeposit) private {
        checkTargetCollateralRatio(targetCollateralRatio);

        if (msg.value > 0) {
            reserve.addMinterDepositETH(msg.sender, msg.value);
            require(reserve.getMinterDepositETH(msg.sender) == targetDeposit, ERR_INVALID_TARGET_DEPOSIT);
        }

        uint originalDebt = reserve.getMinterDebtETH(msg.sender);
        uint targetDebt = targetDeposit.divideDecimal(targetCollateralRatio).divideDecimal(synth.getSynthPriceToEth());
        if (originalDebt > targetDebt) {
            synth.burnFromWithETH(msg.sender, msg.sender, originalDebt.sub(targetDebt));
        } else if (originalDebt < targetDebt) {
            synth.mintWithETH(msg.sender, targetDebt - originalDebt);
        }

        uint originalDeposit = reserve.getMinterDepositETH(msg.sender);
        if (originalDeposit > targetDeposit) {
            reserve.reduceMinterDepositETH(msg.sender, originalDeposit - targetDeposit);
            payable(msg.sender).transfer(originalDeposit - targetDeposit);
        }
    }

    function userLiquidateETH(address account, uint synthAmount) external override payable lock {
        (uint totalRedeemed, uint amountToLiquidate) = synth.liquidateDelinquentAccount(account, synthAmount, msg.sender);
        payable(msg.sender).transfer(totalRedeemed);
    }

    function transferERC721(address assetAddr, address to, uint256 tokenId) internal {
        address kitties = 0x06012c8cf97BEaD5deAe237070F9587f8E7A266d;
        address punks = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;
        bytes memory data;
        if (assetAddr == kitties) {
            // Changed in v1.0.4.
            data = abi.encodeWithSignature("transfer(address,uint256)", to, tokenId);
        } else if (assetAddr == punks) {
            // CryptoPunks.
            data = abi.encodeWithSignature("transferPunk(address,uint256)", to, tokenId);
        } else {
            // Default.
            data = abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", address(this), to, tokenId);
        }
        (bool success, bytes memory returnData) = address(assetAddr).call(data);
        require(success, string(returnData));
    }

    function transferFromERC721(address assetAddr, uint256 tokenId) internal {
        address kitties = 0x06012c8cf97BEaD5deAe237070F9587f8E7A266d;
        address punks = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;
        bytes memory data;
        if (assetAddr == kitties) {
            // Cryptokitties.
            data = abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), tokenId);
        } else if (assetAddr == punks) {
            // CryptoPunks.
            // Fix here for frontrun attack. Added in v1.0.2.
            bytes memory punkIndexToAddress = abi.encodeWithSignature("punkIndexToAddress(uint256)", tokenId);
            (bool checkSuccess, bytes memory result) = address(assetAddr).staticcall(punkIndexToAddress);
            (address nftOwner) = abi.decode(result, (address));
            require(checkSuccess && nftOwner == msg.sender, ERR_NOT_NFT_OWNER);
            data = abi.encodeWithSignature("buyPunk(uint256)", tokenId);
        } else {
            // Default.
            // Allow other contracts to "push" into the vault, safely.
            // If we already have the token requested, make sure we don't have it in the list to prevent duplicate minting.
            require(IERC721Upgradeable(assetAddr).ownerOf(tokenId) == msg.sender, ERR_NOT_NFT_OWNER);
            data = abi.encodeWithSignature("safeTransferFrom(address,address,uint256)", msg.sender, address(this), tokenId);
        }
        (bool success, bytes memory resultData) = address(assetAddr).call(data);
        require(success, string(resultData));
    }

    function userMintSynthNFT(uint[] calldata tokenIds) external lock {
        for (uint i = 0; i < tokenIds.length; i++) {
            uint tokenId = tokenIds[i];
            require(!holdings.contains(tokenId), ERR_NFT_ALREADY_IN_HOLDINGS);
            holdings.add(tokenId);
            transferFromERC721(NFTAddress, tokenId);
            reserve.addMinterDepositNFT(msg.sender, tokenId);
            NFTDepositer[tokenId] = msg.sender;
            NFTDepositTimes[tokenId] = block.timestamp;
        }
        synth.mint(msg.sender, tokenIds.length.mul(SafeDecimalMath.unit()));
    }

    function userBurnSynthNFT(uint[] calldata tokenIds) external lock {
        for (uint i = 0; i < tokenIds.length; i++) {
            uint tokenId = tokenIds[i];
            require(holdings.contains(tokenId), ERR_NFT_NOT_IN_HOLDINGS);
            holdings.remove(tokenId);
            address depositer = NFTDepositer[tokenId];
            require(depositer == msg.sender || block.timestamp > (NFTDepositTimes[tokenId].add(lockingPeriod)), ERR_WITHIN_LOCKING_PERIOD);
            transferERC721(NFTAddress, msg.sender, tokenId);
            reserve.reduceMinterDepositNFT(depositer, tokenId);
            delete NFTDepositer[tokenId];
            delete NFTDepositTimes[tokenId];
        }
        synth.burn(msg.sender, tokenIds.length.mul(SafeDecimalMath.unit()));
    }
}
