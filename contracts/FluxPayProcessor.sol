// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract FluxPayProcessor is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    address public treasuryWallet; 
    uint256 public feeRate;        
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    event PaymentReceived(address indexed buyer, address indexed token, uint256 amount, uint256 fee);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _owner, address _treasury, uint256 _feeRate) public initializer {
        __UUPSUpgradeable_init();
        __Ownable_init(_owner);
        __ReentrancyGuard_init();
        treasuryWallet = _treasury;
        feeRate = _feeRate;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function payWithETH(address projectCreator) external payable nonReentrant {
        uint256 fee = (msg.value * feeRate) / BASIS_POINTS_DIVISOR;
        uint256 amountToCreator = msg.value - fee;

        if (fee > 0) payable(treasuryWallet).transfer(fee);
        if (amountToCreator > 0) payable(projectCreator).transfer(amountToCreator);

        emit PaymentReceived(msg.sender, address(0), msg.value, fee);
    }

    function payWithToken(address token, uint256 amount, address projectCreator) external nonReentrant {
        IERC20 tokenContract = IERC20(token);
        tokenContract.safeTransferFrom(msg.sender, address(this), amount);

        uint256 fee = (amount * feeRate) / BASIS_POINTS_DIVISOR;
        uint256 amountToCreator = amount - fee;

        if (fee > 0) tokenContract.safeTransfer(treasuryWallet, fee);
        if (amountToCreator > 0) tokenContract.safeTransfer(projectCreator, amountToCreator);

        emit PaymentReceived(msg.sender, token, amount, fee);
    }

    function updateConfig(address _treasury, uint256 _feeRate) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        treasuryWallet = _treasury;
        feeRate = _feeRate;
    }
}
