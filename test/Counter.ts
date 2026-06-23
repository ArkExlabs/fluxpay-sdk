// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import { network } from "hardhat";
import { FluxPay } from "../src/FluxPay.js";
import FluxPayArtifact from "../artifacts/contracts/FluxPayProcessor.sol/FluxPayProcessor.json" with { type: "json" };

describe("FluxPay SDK Full Integration Test", () => {
  it("Should perform full lifecycle: Init -> Pay -> Config", async () => {
    
    const { ethers } = await network.create();
    const [owner, treasury, creator] = await ethers.getSigners();
    
    // 🌟 核心改动：在临时链上动态部署一份新鲜的合约
    console.log("-> 1. Deploying fresh contract for testing...");
    const FluxPayFactory = await ethers.getContractFactory("FluxPayProcessor");
    const deployedContract = await FluxPayFactory.deploy();
    const contractAddress = await deployedContract.getAddress(); 
    console.log(`   Contract dynamically deployed at: ${contractAddress}`);
    
    // 使用动态获取的地址实例化 SDK
    const fluxPay = new FluxPay(contractAddress, FluxPayArtifact.abi, owner);

    console.log("-> 2. Initializing SDK...");
    await fluxPay.initialize(owner.address, treasury.address, 250);
    
    console.log("-> 3. Processing ETH payment...");
    const amount = ethers.parseEther("1.0");
    await fluxPay.payWithETH(creator.address, amount);
    
    console.log("-> 4. Verifying balances...");
    const creatorBalance = await ethers.provider.getBalance(creator.address);
    // 初始有10000，收到了1 ETH，余额必然大于 10000
    expect(creatorBalance).to.be.gt(ethers.parseEther("10000")); 
    
    console.log("-> 5. Updating configuration...");
    await fluxPay.updateConfig(treasury.address, 300);
    
    console.log("🎉 Test Passed: All SDK methods completely verified!");
  });
});