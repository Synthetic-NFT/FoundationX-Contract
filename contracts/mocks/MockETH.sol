// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";
import "../libraries/SafeDecimalMath.sol";

contract MockETH is Initializable, ERC20Upgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    string public constant ERR_EXCEED_MINT_LIMIT = "Exceed mint limit";
    uint public constant MINT_LIMIT = 1000 * 10**18;

    mapping(address => uint) tokenMinted;

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
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(UPGRADER_ROLE) override {}

    function mint(address account, uint amount) public {
        require(mintable(account) >= amount, ERR_EXCEED_MINT_LIMIT);
        _mint(account, amount);
        tokenMinted[account] += amount;
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
        if (amount > tokenMinted[account]) {
            tokenMinted[account] = 0;
        } else {
            tokenMinted[account] -= amount;
        }
    }

    function mintable(address account) public view returns (uint) {
        return MINT_LIMIT - tokenMinted[account];
    }
}
