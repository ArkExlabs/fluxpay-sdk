// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import FluxPayArtifact from "../artifacts/contracts/FluxPayProcessor.sol/FluxPayProcessor.json" with { type: "json" };

type AbiItem = {
  type: string;
  name?: string;
  inputs?: Array<{
    name: string;
    type: string;
    indexed?: boolean;
  }>;
  outputs?: Array<{
    name: string;
    type: string;
  }>;
  stateMutability?: string;
};

function signatureOf(item: AbiItem): string {
  const inputs = item.inputs ?? [];
  const inputTypes = inputs.map((input) => input.type).join(",");
  return `${item.name ?? "<anonymous>"}(${inputTypes})`;
}

function abiItemsByType(type: string): AbiItem[] {
  return (FluxPayArtifact.abi as AbiItem[]).filter((item) => item.type === type);
}

function signaturesByType(type: string): string[] {
  return abiItemsByType(type).map(signatureOf).sort();
}

describe("FluxPay v0.2.8 ABI / Event / Error Freeze", () => {
  it("should preserve stable SDK-facing function signatures", () => {
    const functions = signaturesByType("function");

    const requiredFunctions = [
      "payWithETH(address)",
      "payWithToken(address,uint256,address)",
      "updateConfig(address,uint256)",
      "pause()",
      "unpause()",
      "owner()",
      "treasuryWallet()",
      "feeRate()",
      "productionLocked()",
      "paused()",
      "BASIS_POINTS_DIVISOR()",
      "MAX_FEE_RATE()",
    ];

    for (const requiredFunction of requiredFunctions) {
      expect(functions).to.include(requiredFunction);
    }
  });

  it("should preserve stable event signatures", () => {
    const events = signaturesByType("event");

    const requiredEvents = [
      "PaymentReceived(address,address,uint256,uint256)",
      "ConfigUpdated(address,uint256)",
      "ProductionLocked()",
      "Paused(address)",
      "Unpaused(address)",
      "OwnershipTransferred(address,address)",
    ];

    for (const requiredEvent of requiredEvents) {
      expect(events).to.include(requiredEvent);
    }
  });

  it("should preserve FluxPay-specific custom error signatures", () => {
    const errors = signaturesByType("error");

    const requiredErrors = [
      "InvalidAddress()",
      "InvalidAmount()",
      "FeeRateTooHigh()",
      "EthTransferFailed()",
      "ProductionNotLocked()",
      "ReentrancyDetected()",
    ];

    for (const requiredError of requiredErrors) {
      expect(errors).to.include(requiredError);
    }
  });

  it("PaymentReceived should keep indexed buyer and token parameters", () => {
    const paymentReceived = abiItemsByType("event").find(
      (item) => item.name === "PaymentReceived"
    );

    expect(paymentReceived).to.not.equal(undefined);

    const inputs = paymentReceived!.inputs ?? [];

    expect(inputs.length).to.equal(4);

    expect(inputs[0].name).to.equal("buyer");
    expect(inputs[0].type).to.equal("address");
    expect(inputs[0].indexed).to.equal(true);

    expect(inputs[1].name).to.equal("token");
    expect(inputs[1].type).to.equal("address");
    expect(inputs[1].indexed).to.equal(true);

    expect(inputs[2].name).to.equal("amount");
    expect(inputs[2].type).to.equal("uint256");
    expect(inputs[2].indexed ?? false).to.equal(false);

    expect(inputs[3].name).to.equal("fee");
    expect(inputs[3].type).to.equal("uint256");
    expect(inputs[3].indexed ?? false).to.equal(false);
  });

  it("ConfigUpdated should keep indexed treasuryWallet parameter", () => {
    const configUpdated = abiItemsByType("event").find(
      (item) => item.name === "ConfigUpdated"
    );

    expect(configUpdated).to.not.equal(undefined);

    const inputs = configUpdated!.inputs ?? [];

    expect(inputs.length).to.equal(2);

    expect(inputs[0].name).to.equal("treasuryWallet");
    expect(inputs[0].type).to.equal("address");
    expect(inputs[0].indexed).to.equal(true);

    expect(inputs[1].name).to.equal("feeRate");
    expect(inputs[1].type).to.equal("uint256");
    expect(inputs[1].indexed ?? false).to.equal(false);
  });
});