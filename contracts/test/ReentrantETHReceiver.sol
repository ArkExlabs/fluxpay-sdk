// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFluxPayProcessorLike {
    function payWithETH(address projectCreator) external payable;
}

contract ReentrantETHReceiver {
    IFluxPayProcessorLike public immutable processor;

    bool public attackEnabled;
    bool public reentryAttempted;
    bool public reentrySucceeded;
    bool public reentryBlocked;
    uint256 public receiveCount;

    event ReentryAttempted();
    event ReentrySucceeded();
    event ReentryBlocked();

    constructor(address processor_) {
        processor = IFluxPayProcessorLike(processor_);
    }

    function setAttackEnabled(bool enabled) external {
        attackEnabled = enabled;
    }

    receive() external payable {
        receiveCount += 1;

        if (attackEnabled && !reentryAttempted) {
            reentryAttempted = true;
            emit ReentryAttempted();

            try processor.payWithETH{value: 1 wei}(address(this)) {
                reentrySucceeded = true;
                emit ReentrySucceeded();
            } catch {
                reentryBlocked = true;
                emit ReentryBlocked();
            }
        }
    }

    fallback() external payable {
        receiveCount += 1;
    }
}