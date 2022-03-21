pragma solidity ^0.8.0;

import "./interfaces/IOracle.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./libraries/SafeDecimalMath.sol";
import "hardhat/console.sol";


contract Oracle is IOracle, AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // Exchange rates stored by currency code, e.g. 'SNX', or 'sUSD'
    mapping(string => uint) private assetPrices;

    // Update times stored by currency code, e.g. 'SNX', or 'sUSD'
    mapping(string => uint) private lastPriceUpdateTimes;

    // The address of the oracle which pushes rate updates to this contract
    address public oracle;

    // Do not allow the oracle to submit times any further forward into the future than this constant.
    uint constant ORACLE_FUTURE_LIMIT = 10 minutes;

    // How long will the contract assume the rate of any asset is correct
    uint public priceStalePeriod;

    string public constant ERR_PRICE_STALE = "Price stales";
    string public constant ERR_TOO_FAR_INTO_FUTURE = "Time is too far into the future";

    event OracleUpdated(address newOracle);
    event PriceStalePeriodUpdated(uint rateStalePeriod);
    event PricesUpdated(string[] assets, uint[] prices);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _oracle,
        uint _priceStalePeriod
    ) initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);

        oracle = _oracle;
        priceStalePeriod = _priceStalePeriod;
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(UPGRADER_ROLE) override {}

    function updatePrices(string[] calldata assets, uint[] calldata prices, uint timeSent) external onlyOracle {
        internalUpdatePrices(assets, prices, timeSent);
    }

    function internalUpdatePrices(string[] calldata assets, uint[] calldata prices, uint timeSent) internal {
        require(assets.length == prices.length, "Currency key array length must match rates array length.");
        require(timeSent < (block.timestamp.add(ORACLE_FUTURE_LIMIT)), ERR_TOO_FAR_INTO_FUTURE);

        for (uint i = 0; i < assets.length; i++) {
            require(prices[i] != 0, "Zero is not a valid rate, please call deleteRate instead.");

            if (timeSent >= lastPriceUpdateTimes[assets[i]]) {
                assetPrices[assets[i]] = prices[i];
                lastPriceUpdateTimes[assets[i]] = timeSent;
            }
        }

        emit PricesUpdated(assets, prices);
    }

    function setOracle(address _oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        oracle = _oracle;
        emit OracleUpdated(oracle);
    }

    function setPriceStalePeriod(uint _time) external onlyRole(DEFAULT_ADMIN_ROLE) {
        priceStalePeriod = _time;
        emit PriceStalePeriodUpdated(priceStalePeriod);
    }

    function getAssetPrice(string calldata asset) external override view returns (uint) {
        require(!priceIsStale(asset), ERR_PRICE_STALE);
        return assetPrices[asset];
    }

    function lastPriceUpdateTime(string calldata asset) public view returns (uint) {
        return lastPriceUpdateTimes[asset];
    }

    function priceIsStale(string calldata asset) public view returns (bool) {
        return lastPriceUpdateTimes[asset].add(priceStalePeriod) < block.timestamp;
    }

    modifier onlyOracle {
        require(msg.sender == oracle, "Only the oracle can perform this action");
        _;
    }
}
