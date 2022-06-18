// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";
import "../libraries/SafeDecimalMath.sol";
import "../interfaces/IWETH.sol";

contract MockWETH is Initializable, IWETH, ERC20Upgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    string public constant ERR_EXCEED_FREE_MINT_LIMIT = "Exceed free mint limit";
    uint freeMintLimit;
    uint public constant DEFAULT_FREE_MINT_LIMIT = 1000 * 10 ** 18;

    mapping(address => uint) freeMinted;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        string memory _name,
        string memory _symbol
    ) initializer public {
        __ERC20_init(_name, _symbol);
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);

        setFreeMintLimit(DEFAULT_FREE_MINT_LIMIT);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(UPGRADER_ROLE) override {}

    function setFreeMintLimit(uint _freeMintLimit) public onlyRole(DEFAULT_ADMIN_ROLE) {
        freeMintLimit = _freeMintLimit;
    }

    function mintFree(address account, uint amount) public {
        require(mintableFree(account) >= amount, ERR_EXCEED_FREE_MINT_LIMIT);
        _mint(account, amount);
        freeMinted[account] += amount;
    }

    function mintableFree(address account) public view returns (uint) {
        return freeMintLimit - freeMinted[account];
    }

    function deposit() external override payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint amount) external override {
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
    }

    function balanceOf(address account) public view override (IWETH, ERC20Upgradeable) returns (uint) {
        return ERC20Upgradeable.balanceOf(account);
    }

    function transfer(address to, uint256 amount) public override (IWETH, ERC20Upgradeable) returns (bool) {
        return ERC20Upgradeable.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint amount) public override (IWETH, ERC20Upgradeable) returns (bool) {
        return ERC20Upgradeable.transferFrom(from, to, amount);
    }
}
