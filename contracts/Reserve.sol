// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;



import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./interfaces/IReserve.sol";
import "./libraries/SafeDecimalMath.sol";

contract Reserve is IReserve, AccessControlUpgradeable, UUPSUpgradeable {

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    mapping(address => uint) minterDebtBalance;
    mapping(address => uint) minterDepositBalance;
    uint minCollateralRatio;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        uint _minCollateralRatio
    ) initializer public {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);

        setMinCollateralRatio(_minCollateralRatio);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyRole(UPGRADER_ROLE) override {}

    function setMinCollateralRatio(uint collateralRatio) public onlyRole(DEFAULT_ADMIN_ROLE) {
        minCollateralRatio = collateralRatio;
    }

    function getMinCollateralRatio() public view returns (uint) {
        return minCollateralRatio;
    }

    function getMinterCollateralRatio(address minter, uint assetPrice) public view returns (uint) {
        return minterDepositBalance[minter].divideDecimal(minterDebtBalance[minter].multiplyDecimal(assetPrice));
    }

    function addMinterDebt(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDebtBalance[minter] += amount;
    }

    function reduceMinterDebt(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDebtBalance[minter] -= amount;
    }

    function getMinterDebt(address minter) public view returns (uint) {
        return minterDebtBalance[minter];
    }

    function addMinterDeposit(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDepositBalance[minter] += amount;
    }

    function reduceMinterDeposit(address minter, uint amount) public onlyRole(MINTER_ROLE) {
        minterDepositBalance[minter] -= amount;
    }

    function getMinterDeposit(address minter) public view returns (uint) {
        return minterDepositBalance[minter];
    }

//    modifier onlyFactory() {
//        require(msg.sender == address(issuer()), "Liquidations: Only the Issuer contract can perform this action");
//        _;
//    }
}