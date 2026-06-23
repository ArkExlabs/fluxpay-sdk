// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract RejectETHReceiver {
    error ETHRejected();

    receive() external payable {
        revert ETHRejected();
    }

    fallback() external payable {
        revert ETHRejected();
    }
}