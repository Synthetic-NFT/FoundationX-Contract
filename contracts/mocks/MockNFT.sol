// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";


/**
 * @title ERC721Mock
 * This mock just provides a public safeMint, mint, and burn functions for testing purposes
 */
contract MockNFT is Initializable, AccessControlUpgradeable, ERC721EnumerableUpgradeable {
    using EnumerableMap for EnumerableMap.UintToAddressMap;
    using EnumerableSet for EnumerableSet.UintSet;

    mapping(uint => string) private tokenURIs;
    // Remaining token IDs that can be minted.
    EnumerableSet.UintSet remainingTokenIds;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        string memory _tokenName,
        string memory _tokenSymbol
    ) initializer public {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        __ERC721_init_unchained(_tokenName, _tokenSymbol);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721EnumerableUpgradeable, AccessControlUpgradeable) returns (bool) {
        return ERC721EnumerableUpgradeable.supportsInterface(interfaceId) || AccessControlUpgradeable.supportsInterface(interfaceId);
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    function mint(address to, uint256 tokenId) public {
        _mint(to, tokenId);
    }

    function safeMint(address to, uint256 tokenId) public {
        _safeMint(to, tokenId);
        remainingTokenIds.remove(tokenId);
    }

    function burn(uint256 tokenId) public {
        _burn(tokenId);
    }

    function batchSetTokenURI(uint256[] calldata _tokenIds, string[] calldata _tokenURIs) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokenIds.length == _tokenURIs.length);
        for (uint i = 0; i < _tokenIds.length; i++) {
            tokenURIs[_tokenIds[i]] = _tokenURIs[i];
            remainingTokenIds.add(_tokenIds[i]);
        }
    }

    function remainingTokenURI() public view returns (uint256[] memory _tokenIds, string[] memory _tokenURIs) {
        uint numTokens = remainingTokenIds.length();
        _tokenIds = new uint256[](numTokens);
        _tokenURIs = new string[](numTokens);
        for (uint i = 0; i < numTokens; i++) {
            _tokenIds[i] = remainingTokenIds.at(i);
            _tokenURIs[i] = tokenURIs[_tokenIds[i]];
        }
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
