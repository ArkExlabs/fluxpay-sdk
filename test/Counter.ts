// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { FluxPay } from "../src/FluxPay.js";
import FluxPayArtifact from "../artifacts/contracts/FluxPayProcessor.sol/FluxPayProcessor.json" with { type: "json" };

describe("FluxPay SDK Full Integration Test", () => {
  it("Should perform full lifecycle through UUPS proxy: Deploy -> Pay -> Config -> Pause", async () => {
    const connection = await hre.network.create();
    const { ethers } = connection;
    const upgradesApi = await upgrades(hre, connection);

    const [owner, treasury, creator, payer] = await ethers.getSigners();

    console.log("-> 1. Deploying FluxPayProcessor through UUPS proxy...");

    const FluxPayFactory = await ethers.getContractFactory("FluxPayProcessor");

    const deployedContract = await upgradesApi.deployProxy(
      FluxPayFactory,
      [owner.address, treasury.address, 250],
      {
        kind: "uups",
        initializer: "initialize",
      }
    );

    await deployedContract.waitForDeployment();

    const proxyAddress = await deployedContract.getAddress();

    console.log(`   Proxy deployed at: ${proxyAddress}`);

    expect(await deployedContract.owner()).to.equal(owner.address);
    expect(await deployedContract.treasuryWallet()).to.equal(treasury.address);
    expect(await deployedContract.feeRate()).to.equal(250n);
    expect(await deployedContract.productionLocked()).to.equal(true);
    expect(await deployedContract.paused()).to.equal(false);

    console.log("-> 2. Initializing SDK against proxy address...");

    const payerFluxPay = new FluxPay(
      proxyAddress,
      FluxPayArtifact.abi,
      payer
    );

    console.log("-> 3. Processing ETH payment...");

    const paymentAmount = ethers.parseEther("1.0");
    const expectedFee = ethers.parseEther("0.025");
    const expectedCreatorAmount = ethers.parseEther("0.975");

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const creatorBefore = await ethers.provider.getBalance(creator.address);

    await payerFluxPay.payWithETH(creator.address, paymentAmount);

    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    const creatorAfter = await ethers.provider.getBalance(creator.address);

    expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    expect(creatorAfter - creatorBefore).to.equal(expectedCreatorAmount);

    console.log("-> 4. Updating configuration through owner SDK...");

    const ownerFluxPay = new FluxPay(
      proxyAddress,
      FluxPayArtifact.abi,
      owner
    );

    await ownerFluxPay.updateConfig(treasury.address, 300);

    expect(await deployedContract.feeRate()).to.equal(300n);
    expect(await deployedContract.treasuryWallet()).to.equal(treasury.address);

    console.log("-> 5. Testing pause guard...");

    await ownerFluxPay.pause();
    expect(await deployedContract.paused()).to.equal(true);

    let pausedPaymentFailed = false;

    try {
      await payerFluxPay.payWithETH(creator.address, ethers.parseEther("0.1"));
    } catch {
      pausedPaymentFailed = true;
    }

    expect(pausedPaymentFailed).to.equal(true);

    await ownerFluxPay.unpause();
    expect(await deployedContract.paused()).to.equal(false);

    console.log("-> 6. Verifying SDK read methods...");

    expect(await ownerFluxPay.owner()).to.equal(owner.address);
    expect(await ownerFluxPay.treasuryWallet()).to.equal(treasury.address);
    expect(await ownerFluxPay.feeRate()).to.equal(300n);
    expect(await ownerFluxPay.productionLocked()).to.equal(true);
    expect(await ownerFluxPay.paused()).to.equal(false);

    console.log("FluxPay v0.2.0 UUPS lifecycle test passed.");
  });
});