// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
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
    using SafeMath for uint;
    using EnumerableMap for EnumerableMap.UintToAddressMap;
    using EnumerableSet for EnumerableSet.UintSet;

    mapping(uint => string) private tokenURIs;
    // Remaining token IDs that can be minted.
    EnumerableSet.UintSet remainingTokenIds;

    uint16 constant DEFAULT_PAGE_SIZE = 100;
    uint16 public pageSize;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        string memory _tokenName,
        string memory _tokenSymbol
    ) initializer public {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        __ERC721_init_unchained(_tokenName, _tokenSymbol);
        setPageSize(DEFAULT_PAGE_SIZE);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721EnumerableUpgradeable, AccessControlUpgradeable) returns (bool) {
        return ERC721EnumerableUpgradeable.supportsInterface(interfaceId) || AccessControlUpgradeable.supportsInterface(interfaceId);
    }

    function setPageSize(uint16 _pageSize) public onlyRole(DEFAULT_ADMIN_ROLE) {
        pageSize = _pageSize;
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    function safeMint(address to, uint256 tokenId) public {
        _safeMint(to, tokenId);
        remainingTokenIds.remove(tokenId);
    }

    function safeBatchMint(address to, uint256[] calldata tokenId) public {
        for (uint i = 0; i < tokenId.length; i++) {
            _safeMint(to, tokenId[i]);
            remainingTokenIds.remove(tokenId[i]);
        }

    }


    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        return tokenURIs[tokenId];
    }

    function batchSetTokenURI(uint256[] calldata _tokenIds, string[] calldata _tokenURIs) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokenIds.length == _tokenURIs.length);
        for (uint i = 0; i < _tokenIds.length; i++) {
            tokenURIs[_tokenIds[i]] = _tokenURIs[i];
            remainingTokenIds.add(_tokenIds[i]);
        }
    }

    function tokenURINumPages() public view returns (uint) {
        uint quotient = remainingTokenIds.length().div(pageSize);
        if (quotient.mul(pageSize) < remainingTokenIds.length()) {
            quotient += 1;
        }
        return quotient;
    }

    function remainingTokenURI(uint pageIndex) public view returns (uint256[] memory _tokenIds, string[] memory _tokenURIs) {
        uint startIndex = pageIndex * uint(pageSize);
        require(startIndex < remainingTokenIds.length());
        uint resultSize = remainingTokenIds.length() - startIndex;
        resultSize = resultSize < uint(pageSize) ? resultSize : uint(pageSize);
        _tokenIds = new uint256[](resultSize);
        _tokenURIs = new string[](resultSize);
        for (uint i = 0; i < resultSize; i++) {
            _tokenIds[i] = remainingTokenIds.at(startIndex + i);
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
