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
import "hardhat/console.sol";


contract Factory is AccessControlUpgradeable, UUPSUpgradeable {
    mapping(string => Vault) vaults;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize() initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(DEFAULT_ADMIN_ROLE) override {}

    function listSynth(string memory synthName, Vault vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        vaults[synthName] = vault;
    }

    function delistSynth(string memory synthName) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(vaults[synthName]) != address(0));
        delete vaults[synthName];
    }
}
