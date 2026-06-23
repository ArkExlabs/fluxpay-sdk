// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

async function deployFluxPayFixture() {
  const connection = await hre.network.create();
  const { ethers } = connection;
  const upgradesApi = await upgrades(hre, connection);

  const [owner, treasury, creator, payer] = await ethers.getSigners();

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

  return {
    connection,
    ethers,
    upgradesApi,
    proxy,
    owner,
    treasury,
    creator,
    payer,
  };
}

describe("FluxPay v0.2.3 Failure Receiver + Reentrancy Regression Pack", () => {
  it("payWithETH should revert if projectCreator rejects ETH", async () => {
    const { ethers, proxy, treasury, payer } = await deployFluxPayFixture();

    const RejectETHReceiverFactory = await ethers.getContractFactory(
      "RejectETHReceiver"
    );

    const rejectReceiver = await RejectETHReceiverFactory.deploy();
    await rejectReceiver.waitForDeployment();

    const rejectReceiverAddress = await rejectReceiver.getAddress();

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const proxyBefore = await ethers.provider.getBalance(await proxy.getAddress());

    await expect(
      proxy
        .connect(payer)
        .payWithETH(rejectReceiverAddress, {
          value: ethers.parseEther("1.0"),
        })
    ).to.be.rejected;

    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    const proxyAfter = await ethers.provider.getBalance(await proxy.getAddress());

    expect(treasuryAfter).to.equal(treasuryBefore);
    expect(proxyAfter).to.equal(proxyBefore);
  });

  it("payWithETH should revert if treasury rejects ETH", async () => {
    const { ethers, proxy, creator, payer } = await deployFluxPayFixture();

    const RejectETHReceiverFactory = await ethers.getContractFactory(
      "RejectETHReceiver"
    );

    const rejectReceiver = await RejectETHReceiverFactory.deploy();
    await rejectReceiver.waitForDeployment();

    const rejectReceiverAddress = await rejectReceiver.getAddress();

    await proxy.updateConfig(rejectReceiverAddress, 250);

    const creatorBefore = await ethers.provider.getBalance(creator.address);
    const proxyBefore = await ethers.provider.getBalance(await proxy.getAddress());

    await expect(
      proxy
        .connect(payer)
        .payWithETH(creator.address, {
          value: ethers.parseEther("1.0"),
        })
    ).to.be.rejected;

    const creatorAfter = await ethers.provider.getBalance(creator.address);
    const proxyAfter = await ethers.provider.getBalance(await proxy.getAddress());

    expect(creatorAfter).to.equal(creatorBefore);
    expect(proxyAfter).to.equal(proxyBefore);
  });

  it("projectCreator reentrancy attempt should be blocked while outer ETH payment succeeds", async () => {
    const { ethers, proxy, treasury, payer } = await deployFluxPayFixture();

    const ReentrantETHReceiverFactory = await ethers.getContractFactory(
      "ReentrantETHReceiver"
    );

    const reentrantReceiver = await ReentrantETHReceiverFactory.deploy(
      await proxy.getAddress()
    );

    await reentrantReceiver.waitForDeployment();

    const reentrantReceiverAddress = await reentrantReceiver.getAddress();

    await reentrantReceiver.setAttackEnabled(true);

    const paymentAmount = ethers.parseEther("1.0");
    const expectedFee = ethers.parseEther("0.025");
    const expectedCreatorAmount = ethers.parseEther("0.975");

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const receiverBefore = await ethers.provider.getBalance(
      reentrantReceiverAddress
    );
    const proxyBefore = await ethers.provider.getBalance(await proxy.getAddress());

    await proxy
      .connect(payer)
      .payWithETH(reentrantReceiverAddress, { value: paymentAmount });

    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    const receiverAfter = await ethers.provider.getBalance(
      reentrantReceiverAddress
    );
    const proxyAfter = await ethers.provider.getBalance(await proxy.getAddress());

    expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    expect(receiverAfter - receiverBefore).to.equal(expectedCreatorAmount);
    expect(proxyAfter).to.equal(proxyBefore);

    expect(await reentrantReceiver.receiveCount()).to.equal(1n);
    expect(await reentrantReceiver.reentryAttempted()).to.equal(true);
    expect(await reentrantReceiver.reentryBlocked()).to.equal(true);
    expect(await reentrantReceiver.reentrySucceeded()).to.equal(false);

    const paymentEvents = await proxy.queryFilter(
      proxy.filters.PaymentReceived(payer.address, ethers.ZeroAddress)
    );

    expect(paymentEvents.length).to.equal(1);
    expect(paymentEvents[0].args.buyer).to.equal(payer.address);
    expect(paymentEvents[0].args.token).to.equal(ethers.ZeroAddress);
    expect(paymentEvents[0].args.amount).to.equal(paymentAmount);
    expect(paymentEvents[0].args.fee).to.equal(expectedFee);
  });

  it("treasury reentrancy attempt should be blocked while outer ETH payment succeeds", async () => {
    const { ethers, proxy, creator, payer } = await deployFluxPayFixture();

    const ReentrantETHReceiverFactory = await ethers.getContractFactory(
      "ReentrantETHReceiver"
    );

    const reentrantTreasury = await ReentrantETHReceiverFactory.deploy(
      await proxy.getAddress()
    );

    await reentrantTreasury.waitForDeployment();

    const reentrantTreasuryAddress = await reentrantTreasury.getAddress();

    await reentrantTreasury.setAttackEnabled(true);
    await proxy.updateConfig(reentrantTreasuryAddress, 250);

    const paymentAmount = ethers.parseEther("1.0");
    const expectedFee = ethers.parseEther("0.025");
    const expectedCreatorAmount = ethers.parseEther("0.975");

    const treasuryBefore = await ethers.provider.getBalance(
      reentrantTreasuryAddress
    );
    const creatorBefore = await ethers.provider.getBalance(creator.address);
    const proxyBefore = await ethers.provider.getBalance(await proxy.getAddress());

    await proxy
      .connect(payer)
      .payWithETH(creator.address, { value: paymentAmount });

    const treasuryAfter = await ethers.provider.getBalance(
      reentrantTreasuryAddress
    );
    const creatorAfter = await ethers.provider.getBalance(creator.address);
    const proxyAfter = await ethers.provider.getBalance(await proxy.getAddress());

    expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    expect(creatorAfter - creatorBefore).to.equal(expectedCreatorAmount);
    expect(proxyAfter).to.equal(proxyBefore);

    expect(await reentrantTreasury.receiveCount()).to.equal(1n);
    expect(await reentrantTreasury.reentryAttempted()).to.equal(true);
    expect(await reentrantTreasury.reentryBlocked()).to.equal(true);
    expect(await reentrantTreasury.reentrySucceeded()).to.equal(false);

    const paymentEvents = await proxy.queryFilter(
      proxy.filters.PaymentReceived(payer.address, ethers.ZeroAddress)
    );

    expect(paymentEvents.length).to.equal(1);
    expect(paymentEvents[0].args.buyer).to.equal(payer.address);
    expect(paymentEvents[0].args.token).to.equal(ethers.ZeroAddress);
    expect(paymentEvents[0].args.amount).to.equal(paymentAmount);
    expect(paymentEvents[0].args.fee).to.equal(expectedFee);
  });
});