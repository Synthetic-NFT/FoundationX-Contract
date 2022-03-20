pragma solidity ^0.8.0;

import "./interfaces/IOracle.sol";

contract Oracle is IOracle, AccessControlUpgradeable, UUPSUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== EVENTS ========== */

    event OracleUpdated(address newOracle);
    event RateStalePeriodUpdated(uint rateStalePeriod);
    event RatesUpdated(bytes4[] currencyKeys, uint[] newRates);
    event RateDeleted(bytes4 currencyKey);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address _oracle,
        string[] calldata assets,
        uint[] calldata prices
    ) initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);

        oracle = _oracle;
        internalUpdatePrices(assert, prices, now);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(UPGRADER_ROLE) override {}


    // Exchange rates stored by currency code, e.g. 'SNX', or 'sUSD'
    mapping(string => uint) private assetPrices;

    // Update times stored by currency code, e.g. 'SNX', or 'sUSD'
    mapping(string => uint) private lastRateUpdateTimes;

    // The address of the oracle which pushes rate updates to this contract
    address public oracle;

    // Do not allow the oracle to submit times any further forward into the future than this constant.
    uint constant ORACLE_FUTURE_LIMIT = 10 minutes;

    // How long will the contract assume the rate of any asset is correct
    uint public rateStalePeriod = 1 hours;


    function updatePrices(bytes4[] currencyKeys, uint[] newRates, uint timeSent) external onlyOracle returns (bool) {
        return internalUpdatePrices(currencyKeys, newRates, timeSent);
    }

    function internalUpdatePrices(string[] calldata assets, uint[] calldata prices, uint timeSent) internal {
        require(assets.length == prices.length, "Currency key array length must match rates array length.");
        require(timeSent < (now + ORACLE_FUTURE_LIMIT), "Time is too far into the future");

        for (uint i = 0; i < assets.length; i++) {
            require(newRates[i] != 0, "Zero is not a valid rate, please call deleteRate instead.");

            if (timeSent >= lastRateUpdateTimes[currencyKeys[i]]) {
                // Ok, go ahead with the update.
                assetPrices[currencyKeys[i]] = newRates[i];
                lastRateUpdateTimes[currencyKeys[i]] = timeSent;
            }
        }

        emit RatesUpdated(assets, prices);
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(oracle);
    }

    function setRateStalePeriod(uint _time) external onlyOwner {
        rateStalePeriod = _time;
        emit RateStalePeriodUpdated(rateStalePeriod);
    }

    function lastRateUpdateTime(string memory asset) public view returns (uint) {
        return lastRateUpdateTimes[currencyKey];
    }

    function priceIsStale(string memory asset) external view returns (bool) {
        return lastRateUpdateTimes[currencyKey].add(rateStalePeriod) < now;
    }

    modifier onlyOracle
    {
        require(msg.sender == oracle, "Only the oracle can perform this action");
        _;
    }
}
