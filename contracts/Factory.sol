// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./interfaces/IFactory.sol";
import "./Synth.sol";
import "./Reserve.sol";
import "./Vault.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "./libraries/SafeDecimalMath.sol";


contract Factory is AccessControlUpgradeable, UUPSUpgradeable {
    mapping(string => Vault) vaults;
    string[] public listedTokens;
    uint8 public numListedTokens;

    string public constant ERR_SYNTH_NOT_AVAILABLE = "Synth not available";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize() initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(DEFAULT_ADMIN_ROLE) override {}

    function listVaults(string[] calldata _synthNames, Vault[] calldata _vaults) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_synthNames.length == _vaults.length);
        for (uint8 i = 0; i < _vaults.length; i++) {
            string memory synthName = _synthNames[i];
            require(address(vaults[synthName]) == address(0));
            vaults[synthName] = _vaults[i];
            listedTokens.push(synthName);
            numListedTokens += 1;
        }
    }

    function delistVaults(string[] calldata synthNames) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint8 i = 0; i < synthNames.length; i++) {
            string memory synthName = synthNames[i];
            require(address(vaults[synthName]) != address(0));
            delete vaults[synthName];
            numListedTokens -= 1;
        }
    }

    function listUserDebtDeposit(address account, string[] calldata tokens) public view returns (uint[] memory debts, uint[] memory deposits) {
        debts = new uint[](tokens.length);
        deposits = new uint[](tokens.length);
        for (uint8 i = 0; i < tokens.length; i++) {
            string memory token = tokens[i];
            Vault vault = vaults[token];
            require(address(vault) != address(0), ERR_SYNTH_NOT_AVAILABLE);
            Reserve reserve = vault.reserve();
            debts[i] = reserve.getMinterDebtETH(account);
            deposits[i] = reserve.getMinterDepositETH(account);
        }
        return (debts, deposits);
    }

    function listTokenAddressInfo() public view returns (string[] memory tokenNames, address[] memory vaultAddresses, address[] memory synthAddresses, address[] memory reserveAddresses) {
        tokenNames = new string[](numListedTokens);
        vaultAddresses = new address[](numListedTokens);
        synthAddresses = new address[](numListedTokens);
        reserveAddresses = new address[](numListedTokens);
        uint result_i = 0;
        for (uint8 i = 0; i < listedTokens.length; i++) {
            string memory tokenName = listedTokens[i];
            Vault vault = vaults[tokenName];
            if (address(vault) != address(0)) {
                tokenNames[result_i] = tokenName;
                vaultAddresses[result_i] = address(vault);
                synthAddresses[result_i] = address(vault.synth());
                reserveAddresses[result_i] = address(vault.reserve());
            }
        }
    }
}
