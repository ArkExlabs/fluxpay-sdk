// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { FluxPay } from "../src/FluxPay.js";
import FluxPayArtifact from "../artifacts/contracts/FluxPayProcessor.sol/FluxPayProcessor.json" with { type: "json" };

async function deployFluxPayParserFixture() {
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

describe("FluxPay v0.3.1 SDK Receipt Parser + Event Decoder", () => {
  it("parseReceipt() should decode native PaymentReceived event", async () => {
    const { ethers, proxyAddress, creator, payer } =
      await deployFluxPayParserFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: payer,
    });

    const amount = ethers.parseEther("1.0");
    const expectedFee = ethers.parseEther("0.025");

    const receipt = await client.payNative({
      projectCreator: creator.address,
      amount,
    });

    const parsed = client.parseReceipt(receipt);

    expect(parsed.transactionHash).to.equal(receipt!.hash);
    expect(parsed.blockNumber).to.equal(receipt!.blockNumber);
    expect(parsed.events.length).to.equal(1);
    expect(parsed.paymentReceived.length).to.equal(1);
    expect(parsed.configUpdated.length).to.equal(0);
    expect(parsed.productionLocked.length).to.equal(0);

    const payment = parsed.paymentReceived[0];

    expect(payment.name).to.equal("PaymentReceived");
    expect(payment.buyer).to.equal(payer.address);
    expect(payment.token).to.equal(ethers.ZeroAddress);
    expect(payment.amount).to.equal(amount);
    expect(payment.fee).to.equal(expectedFee);
    expect(payment.transactionHash).to.equal(receipt!.hash);
    expect(payment.logIndex).to.be.a("number");
  });

  it("parsePaymentReceived() should return native payment events directly", async () => {
    const { ethers, proxyAddress, creator, payer } =
      await deployFluxPayParserFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: payer,
    });

    const amount = ethers.parseEther("0.5");
    const expectedFee = ethers.parseEther("0.0125");

    const receipt = await client.payNative({
      projectCreator: creator.address,
      amount,
    });

    const payments = client.parsePaymentReceived(receipt);

    expect(payments.length).to.equal(1);
    expect(payments[0].buyer).to.equal(payer.address);
    expect(payments[0].token).to.equal(ethers.ZeroAddress);
    expect(payments[0].amount).to.equal(amount);
    expect(payments[0].fee).to.equal(expectedFee);
  });

  it("parseReceipt() should decode ERC20 PaymentReceived event and ignore token Transfer logs", async () => {
    const {
      ethers,
      proxyAddress,
      treasury,
      creator,
      payer,
    } = await deployFluxPayParserFixture();

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

    const receipt = await client.payToken({
      token: tokenAddress,
      amount: paymentAmount,
      projectCreator: creator.address,
    });

    const parsed = client.parseReceipt(receipt);

    expect(await token.balanceOf(treasury.address)).to.equal(expectedFee);
    expect(await token.balanceOf(creator.address)).to.equal(
      expectedCreatorAmount
    );

    expect(parsed.paymentReceived.length).to.equal(1);
    expect(parsed.configUpdated.length).to.equal(0);
    expect(parsed.productionLocked.length).to.equal(0);

    const payment = parsed.paymentReceived[0];

    expect(payment.name).to.equal("PaymentReceived");
    expect(payment.buyer).to.equal(payer.address);
    expect(payment.token).to.equal(tokenAddress);
    expect(payment.amount).to.equal(paymentAmount);
    expect(payment.fee).to.equal(expectedFee);
  });

  it("parseReceipt() should decode ConfigUpdated event", async () => {
    const { proxyAddress, owner, newTreasury } =
      await deployFluxPayParserFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: owner,
    });

    const receipt = await client.setConfig({
      treasury: newTreasury.address,
      feeRate: 300,
    });

    const parsed = client.parseReceipt(receipt);
    const configEvents = client.parseConfigUpdated(receipt);

    expect(parsed.paymentReceived.length).to.equal(0);
    expect(parsed.configUpdated.length).to.equal(1);
    expect(parsed.productionLocked.length).to.equal(0);

    expect(configEvents.length).to.equal(1);
    expect(configEvents[0].name).to.equal("ConfigUpdated");
    expect(configEvents[0].treasuryWallet).to.equal(newTreasury.address);
    expect(configEvents[0].feeRate).to.equal(300n);
  });

  it("parseLogs() should decode ProductionLocked event from initialization logs", async () => {
    const { proxy, proxyAddress, owner } = await deployFluxPayParserFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: owner,
    });

    const logs = await proxy.queryFilter(proxy.filters.ProductionLocked());

    expect(logs.length).to.equal(1);

    const parsed = client.parseLogs(logs);

    expect(parsed.paymentReceived.length).to.equal(0);
    expect(parsed.configUpdated.length).to.equal(0);
    expect(parsed.productionLocked.length).to.equal(1);
    expect(parsed.productionLocked[0].name).to.equal("ProductionLocked");
  });

  it("parseReceipt(null) should return an empty parsed receipt", async () => {
    const { proxyAddress, owner } = await deployFluxPayParserFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: owner,
    });

    const parsed = client.parseReceipt(null);

    expect(parsed.transactionHash).to.equal(null);
    expect(parsed.blockNumber).to.equal(null);
    expect(parsed.events.length).to.equal(0);
    expect(parsed.paymentReceived.length).to.equal(0);
    expect(parsed.configUpdated.length).to.equal(0);
    expect(parsed.productionLocked.length).to.equal(0);
  });
});