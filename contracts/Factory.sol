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
    string[] listedTokens;

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
        }
    }

    function delistVaults(string[] calldata synthNames) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint8 i = 0; i < synthNames.length; i++) {
            string memory synthName = synthNames[i];
            require(address(vaults[synthName]) != address(0));
            delete vaults[synthName];
        }
    }

    function listUserDebtDeposit(address account, string[] calldata tokens) public view returns (uint[] memory, uint[] memory) {
        uint[] memory debts = new uint[](tokens.length);
        uint[] memory deposits = new uint[](tokens.length);
        for (uint8 i = 0; i < tokens.length; i++) {
            string memory token = tokens[i];
            Vault vault = vaults[token];
            require(address(vault) != address(0), ERR_SYNTH_NOT_AVAILABLE);
            Reserve reserve = vault.getReserve();
            debts[i] = reserve.getMinterDebtETH(account);
            deposits[i] = reserve.getMinterDepositETH(account);
        }
        return (debts, deposits);
    }
}
