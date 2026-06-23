// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FluxPayProcessor} from "../FluxPayProcessor.sol";

contract FluxPayProcessorV2Mock is FluxPayProcessor {
    function version() external pure returns (string memory) {
        return "v0.2.1-test-v2";
    }
}