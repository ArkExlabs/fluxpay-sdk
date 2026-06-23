// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract FluxPayProcessor is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS_DIVISOR = 10_000;
    uint256 public constant MAX_FEE_RATE = 1_000; // 10%
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    address public treasuryWallet;
    uint256 public feeRate;
    bool public productionLocked;

    uint256 private reentrancyStatus;

    event PaymentReceived(
        address indexed buyer,
        address indexed token,
        uint256 amount,
        uint256 fee
    );

    event ConfigUpdated(
        address indexed treasuryWallet,
        uint256 feeRate
    );

    event ProductionLocked();

    error InvalidAddress();
    error InvalidAmount();
    error FeeRateTooHigh();
    error EthTransferFailed();
    error ProductionNotLocked();
    error ReentrancyDetected();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _owner,
        address _treasury,
        uint256 _feeRate
    ) public initializer {
        if (_owner == address(0)) revert InvalidAddress();
        if (_treasury == address(0)) revert InvalidAddress();
        if (_feeRate > MAX_FEE_RATE) revert FeeRateTooHigh();

        __Ownable_init(_owner);
        __Pausable_init();

        treasuryWallet = _treasury;
        feeRate = _feeRate;
        productionLocked = true;
        reentrancyStatus = NOT_ENTERED;

        emit ConfigUpdated(_treasury, _feeRate);
        emit ProductionLocked();
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    modifier nonReentrantLocal() {
        if (reentrancyStatus == ENTERED) revert ReentrancyDetected();

        reentrancyStatus = ENTERED;
        _;
        reentrancyStatus = NOT_ENTERED;
    }

    modifier onlyProductionLocked() {
        if (!productionLocked) revert ProductionNotLocked();
        _;
    }

    function payWithETH(address projectCreator)
        external
        payable
        nonReentrantLocal
        whenNotPaused
        onlyProductionLocked
    {
        if (projectCreator == address(0)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();

        uint256 fee = (msg.value * feeRate) / BASIS_POINTS_DIVISOR;
        uint256 amountToCreator = msg.value - fee;

        if (fee > 0) {
            _sendETH(payable(treasuryWallet), fee);
        }

        if (amountToCreator > 0) {
            _sendETH(payable(projectCreator), amountToCreator);
        }

        emit PaymentReceived(msg.sender, address(0), msg.value, fee);
    }

    function payWithToken(
        address token,
        uint256 amount,
        address projectCreator
    )
        external
        nonReentrantLocal
        whenNotPaused
        onlyProductionLocked
    {
        if (token == address(0)) revert InvalidAddress();
        if (projectCreator == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        IERC20 tokenContract = IERC20(token);

        tokenContract.safeTransferFrom(msg.sender, address(this), amount);

        uint256 fee = (amount * feeRate) / BASIS_POINTS_DIVISOR;
        uint256 amountToCreator = amount - fee;

        if (fee > 0) {
            tokenContract.safeTransfer(treasuryWallet, fee);
        }

        if (amountToCreator > 0) {
            tokenContract.safeTransfer(projectCreator, amountToCreator);
        }

        emit PaymentReceived(msg.sender, token, amount, fee);
    }

    function updateConfig(
        address _treasury,
        uint256 _feeRate
    ) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        if (_feeRate > MAX_FEE_RATE) revert FeeRateTooHigh();

        treasuryWallet = _treasury;
        feeRate = _feeRate;

        emit ConfigUpdated(_treasury, _feeRate);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _sendETH(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert EthTransferFailed();
    }

    uint256[49] private __gap;
}