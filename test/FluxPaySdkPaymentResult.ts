// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { FluxPay } from "../src/FluxPay.js";
import FluxPayArtifact from "../artifacts/contracts/FluxPayProcessor.sol/FluxPayProcessor.json" with { type: "json" };

async function deployFluxPayPaymentResultFixture() {
  const connection = await hre.network.create();
  const { ethers } = connection;
  const upgradesApi = await upgrades(hre, connection);

  const [owner, treasury, creator, payer, newTreasury] =
    await ethers.getSigners();

  const FluxPayFactory = await ethers.getContractFactory("FluxPayProcessor");

  const proxy = await upgradesApi.deployProxy(
    FluxPayFactory,
    [owner.address, treasury.address, 250],
    {
      kind: "uups",
      initializer: "initialize",
    }
  );

  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();

  return {
    ethers,
    proxy,
    proxyAddress,
    owner,
    treasury,
    creator,
    payer,
    newTreasury,
  };
}

describe("FluxPay v0.3.2 SDK Payment Result Builder + Receipt Normalization", () => {
  it("payNativeAndParse() should return normalized payment result", async () => {
    const { ethers, proxyAddress, treasury, creator, payer } =
      await deployFluxPayPaymentResultFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: payer,
    });

    const amount = ethers.parseEther("1.0");
    const expectedFee = ethers.parseEther("0.025");
    const expectedCreatorAmount = ethers.parseEther("0.975");

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const creatorBefore = await ethers.provider.getBalance(creator.address);

    const result = await client.payNativeAndParse({
      projectCreator: creator.address,
      amount,
    });

    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    const creatorAfter = await ethers.provider.getBalance(creator.address);

    expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    expect(creatorAfter - creatorBefore).to.equal(expectedCreatorAmount);

    expect(result.receipt).to.not.equal(null);
    expect(result.transactionHash).to.equal(result.receipt!.hash);
    expect(result.blockNumber).to.equal(result.receipt!.blockNumber);
    expect(result.parsed.paymentReceived.length).to.equal(1);

    expect(result.payment.name).to.equal("PaymentReceived");
    expect(result.payment.buyer).to.equal(payer.address);
    expect(result.payment.token).to.equal(ethers.ZeroAddress);
    expect(result.payment.amount).to.equal(amount);
    expect(result.payment.fee).to.equal(expectedFee);
  });

  it("payTokenAndParse() should return normalized ERC20 payment result", async () => {
    const {
      ethers,
      proxyAddress,
      treasury,
      creator,
      payer,
    } = await deployFluxPayPaymentResultFixture();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");

    const token = await MockERC20Factory.deploy("FluxPay Test Token", "FPT", 18);

    await token.waitForDeployment();

    const tokenAddress = await token.getAddress();

    const paymentAmount = ethers.parseUnits("100.0", 18);
    const expectedFee = ethers.parseUnits("2.5", 18);
    const expectedCreatorAmount = ethers.parseUnits("97.5", 18);

    await token.mint(payer.address, paymentAmount);
    await token.connect(payer).approve(proxyAddress, paymentAmount);

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: payer,
    });

    const result = await client.payTokenAndParse({
      token: tokenAddress,
      amount: paymentAmount,
      projectCreator: creator.address,
    });

    expect(await token.balanceOf(treasury.address)).to.equal(expectedFee);
    expect(await token.balanceOf(creator.address)).to.equal(
      expectedCreatorAmount
    );
    expect(await token.balanceOf(payer.address)).to.equal(0n);

    expect(result.receipt).to.not.equal(null);
    expect(result.transactionHash).to.equal(result.receipt!.hash);
    expect(result.blockNumber).to.equal(result.receipt!.blockNumber);
    expect(result.parsed.paymentReceived.length).to.equal(1);

    expect(result.payment.name).to.equal("PaymentReceived");
    expect(result.payment.buyer).to.equal(payer.address);
    expect(result.payment.token).to.equal(tokenAddress);
    expect(result.payment.amount).to.equal(paymentAmount);
    expect(result.payment.fee).to.equal(expectedFee);
  });

  it("setConfigAndParse() should return normalized config update result", async () => {
    const { proxyAddress, owner, newTreasury } =
      await deployFluxPayPaymentResultFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: owner,
    });

    const result = await client.setConfigAndParse({
      treasury: newTreasury.address,
      feeRate: 300,
    });

    expect(result.receipt).to.not.equal(null);
    expect(result.transactionHash).to.equal(result.receipt!.hash);
    expect(result.blockNumber).to.equal(result.receipt!.blockNumber);

    expect(result.parsed.configUpdated.length).to.equal(1);
    expect(result.config.name).to.equal("ConfigUpdated");
    expect(result.config.treasuryWallet).to.equal(newTreasury.address);
    expect(result.config.feeRate).to.equal(300n);
  });

  it("normalizeReceipt(null) should return empty normalized transaction", async () => {
    const { proxyAddress, owner } = await deployFluxPayPaymentResultFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: owner,
    });

    const normalized = client.normalizeReceipt(null);

    expect(normalized.transactionHash).to.equal(null);
    expect(normalized.blockNumber).to.equal(null);
    expect(normalized.receipt).to.equal(null);
    expect(normalized.parsed.events.length).to.equal(0);
    expect(normalized.parsed.paymentReceived.length).to.equal(0);
    expect(normalized.parsed.configUpdated.length).to.equal(0);
    expect(normalized.parsed.productionLocked.length).to.equal(0);
  });

  it("buildPaymentResult() should reject receipts without exactly one payment event", async () => {
    const { proxyAddress, owner, newTreasury } =
      await deployFluxPayPaymentResultFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: owner,
    });

    expect(() => client.buildPaymentResult(null)).to.throw(
      "Expected exactly one PaymentReceived event, found 0"
    );

    const configReceipt = await client.setConfig({
      treasury: newTreasury.address,
      feeRate: 300,
    });

    expect(() => client.buildPaymentResult(configReceipt)).to.throw(
      "Expected exactly one PaymentReceived event, found 0"
    );
  });

  it("buildConfigUpdateResult() should reject receipts without exactly one config event", async () => {
    const { ethers, proxyAddress, creator, payer } =
      await deployFluxPayPaymentResultFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: payer,
    });

    expect(() => client.buildConfigUpdateResult(null)).to.throw(
      "Expected exactly one ConfigUpdated event, found 0"
    );

    const paymentReceipt = await client.payNative({
      projectCreator: creator.address,
      amount: ethers.parseEther("0.1"),
    });

    expect(() => client.buildConfigUpdateResult(paymentReceipt)).to.throw(
      "Expected exactly one ConfigUpdated event, found 0"
    );
  });
});