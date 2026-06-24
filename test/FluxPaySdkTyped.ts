// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { ethers } from "ethers";
import { FluxPay } from "../src/FluxPay.js";
import FluxPayArtifact from "../artifacts/contracts/FluxPayProcessor.sol/FluxPayProcessor.json" with { type: "json" };

async function deployFluxPaySdkFixture() {
  const connection = await hre.network.create();
  const { ethers: hardhatEthers } = connection;
  const upgradesApi = await upgrades(hre, connection);

  const [owner, treasury, creator, payer, newTreasury] =
    await hardhatEthers.getSigners();

  const FluxPayFactory = await hardhatEthers.getContractFactory(
    "FluxPayProcessor"
  );

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
    ethers: hardhatEthers,
    proxy,
    proxyAddress,
    owner,
    treasury,
    creator,
    payer,
    newTreasury,
  };
}

describe("FluxPay v0.3.0 SDK Client API Restructure + Typed Payment Methods", () => {
  it("connect() should create a typed SDK client bound to proxy address", async () => {
    const { proxyAddress, owner } = await deployFluxPaySdkFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: owner,
    });

    expect(client.getContractAddress()).to.equal(proxyAddress);
    expect(await client.owner()).to.equal(owner.address);
    expect(await client.feeRate()).to.equal(250n);
    expect(await client.productionLocked()).to.equal(true);
    expect(await client.paused()).to.equal(false);
    expect(await client.basisPointsDivisor()).to.equal(10000n);
    expect(await client.maxFeeRate()).to.equal(1000n);
  });

  it("payNative() should process native-token payment through typed request object", async () => {
    const { ethers: hardhatEthers, proxyAddress, treasury, creator, payer } =
      await deployFluxPaySdkFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: payer,
    });

    const paymentAmount = hardhatEthers.parseEther("1.0");
    const expectedFee = hardhatEthers.parseEther("0.025");
    const expectedCreatorAmount = hardhatEthers.parseEther("0.975");

    const treasuryBefore = await hardhatEthers.provider.getBalance(
      treasury.address
    );
    const creatorBefore = await hardhatEthers.provider.getBalance(
      creator.address
    );

    await client.payNative({
      projectCreator: creator.address,
      amount: paymentAmount,
    });

    const treasuryAfter = await hardhatEthers.provider.getBalance(
      treasury.address
    );
    const creatorAfter = await hardhatEthers.provider.getBalance(
      creator.address
    );

    expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    expect(creatorAfter - creatorBefore).to.equal(expectedCreatorAmount);
  });

  it("payToken() should process ERC20 payment through typed request object", async () => {
    const {
      ethers: hardhatEthers,
      proxyAddress,
      treasury,
      creator,
      payer,
    } = await deployFluxPaySdkFixture();

    const MockERC20Factory = await hardhatEthers.getContractFactory(
      "MockERC20"
    );

    const token = await MockERC20Factory.deploy("FluxPay Test Token", "FPT", 18);

    await token.waitForDeployment();

    const tokenAddress = await token.getAddress();

    const paymentAmount = hardhatEthers.parseUnits("100.0", 18);
    const expectedFee = hardhatEthers.parseUnits("2.5", 18);
    const expectedCreatorAmount = hardhatEthers.parseUnits("97.5", 18);

    await token.mint(payer.address, paymentAmount);
    await token.connect(payer).approve(proxyAddress, paymentAmount);

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: payer,
    });

    await client.payToken({
      token: tokenAddress,
      amount: paymentAmount,
      projectCreator: creator.address,
    });

    expect(await token.balanceOf(treasury.address)).to.equal(expectedFee);
    expect(await token.balanceOf(creator.address)).to.equal(
      expectedCreatorAmount
    );
    expect(await token.balanceOf(payer.address)).to.equal(0n);
  });

  it("setConfig() should update treasury and fee rate through typed request object", async () => {
    const { proxyAddress, owner, newTreasury } =
      await deployFluxPaySdkFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: owner,
    });

    await client.setConfig({
      treasury: newTreasury.address,
      feeRate: 300,
    });

    expect(await client.treasuryWallet()).to.equal(newTreasury.address);
    expect(await client.feeRate()).to.equal(300n);
  });

  it("legacy SDK methods should remain backward-compatible", async () => {
    const {
      ethers: hardhatEthers,
      proxyAddress,
      treasury,
      creator,
      payer,
      owner,
      newTreasury,
    } = await deployFluxPaySdkFixture();

    const payerClient = new FluxPay(proxyAddress, FluxPayArtifact.abi, payer);

    const paymentAmount = hardhatEthers.parseEther("1.0");
    const expectedFee = hardhatEthers.parseEther("0.025");

    const treasuryBefore = await hardhatEthers.provider.getBalance(
      treasury.address
    );

    await payerClient.payWithETH(creator.address, paymentAmount);

    const treasuryAfter = await hardhatEthers.provider.getBalance(
      treasury.address
    );

    expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);

    const ownerClient = new FluxPay(proxyAddress, FluxPayArtifact.abi, owner);

    await ownerClient.updateConfig(newTreasury.address, 300);

    expect(await ownerClient.treasuryWallet()).to.equal(newTreasury.address);
    expect(await ownerClient.feeRate()).to.equal(300n);
  });

  it("SDK client should reject malformed local inputs before sending transactions", async () => {
    const { proxyAddress, payer, creator } = await deployFluxPaySdkFixture();

    const client = FluxPay.connect({
      contractAddress: proxyAddress,
      abi: FluxPayArtifact.abi,
      signer: payer,
    });

    await expect(
      client.payNative({
        projectCreator: ethers.ZeroAddress,
        amount: 1n,
      })
    ).to.be.rejectedWith("projectCreator cannot be the zero address");

    await expect(
      client.payNative({
        projectCreator: creator.address,
        amount: 0n,
      })
    ).to.be.rejectedWith("amount must be greater than zero");

    await expect(
      client.payNative({
        projectCreator: creator.address,
        amount: "1.5",
      })
    ).to.be.rejectedWith(
      "amount string input must be an integer base-unit amount"
    );

    await expect(
      client.setConfig({
        treasury: creator.address,
        feeRate: 1001,
      })
    ).to.be.rejectedWith("feeRate cannot exceed 1000 bps");
  });
});