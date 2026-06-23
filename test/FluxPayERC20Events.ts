// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

async function deployFluxPayERC20Fixture() {
  const connection = await hre.network.create();
  const { ethers } = connection;
  const upgradesApi = await upgrades(hre, connection);

  const [owner, treasury, creator, payer, attacker, newTreasury] =
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

  const MockERC20Factory = await ethers.getContractFactory("MockERC20");

  const token = await MockERC20Factory.deploy("FluxPay Test Token", "FPT", 18);

  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();

  return {
    connection,
    ethers,
    upgradesApi,
    proxy,
    proxyAddress,
    token,
    tokenAddress,
    owner,
    treasury,
    creator,
    payer,
    attacker,
    newTreasury,
  };
}

describe("FluxPay v0.2.2 ERC20 Payment Regression + Event Assertion Pack", () => {
  it("payWithToken should split ERC20 payment between treasury and creator", async () => {
    const {
      ethers,
      proxy,
      proxyAddress,
      token,
      treasury,
      creator,
      payer,
    } = await deployFluxPayERC20Fixture();

    const paymentAmount = ethers.parseUnits("100.0", 18);
    const expectedFee = ethers.parseUnits("2.5", 18);
    const expectedCreatorAmount = ethers.parseUnits("97.5", 18);

    await token.mint(payer.address, paymentAmount);

    expect(await token.balanceOf(payer.address)).to.equal(paymentAmount);
    expect(await token.balanceOf(treasury.address)).to.equal(0n);
    expect(await token.balanceOf(creator.address)).to.equal(0n);

    await token.connect(payer).approve(proxyAddress, paymentAmount);

    await proxy
      .connect(payer)
      .payWithToken(await token.getAddress(), paymentAmount, creator.address);

    expect(await token.balanceOf(payer.address)).to.equal(0n);
    expect(await token.balanceOf(treasury.address)).to.equal(expectedFee);
    expect(await token.balanceOf(creator.address)).to.equal(
      expectedCreatorAmount
    );
  });

  it("payWithToken should revert when allowance is insufficient", async () => {
    const {
      ethers,
      proxy,
      proxyAddress,
      token,
      treasury,
      creator,
      payer,
    } = await deployFluxPayERC20Fixture();

    const paymentAmount = ethers.parseUnits("100.0", 18);
    const insufficientAllowance = ethers.parseUnits("10.0", 18);

    await token.mint(payer.address, paymentAmount);
    await token.connect(payer).approve(proxyAddress, insufficientAllowance);

    await expect(
      proxy
        .connect(payer)
        .payWithToken(await token.getAddress(), paymentAmount, creator.address)
    ).to.be.rejected;

    expect(await token.balanceOf(payer.address)).to.equal(paymentAmount);
    expect(await token.balanceOf(treasury.address)).to.equal(0n);
    expect(await token.balanceOf(creator.address)).to.equal(0n);
  });

  it("payWithToken should revert when token address is zero", async () => {
    const { ethers, proxy, creator, payer } =
      await deployFluxPayERC20Fixture();

    const paymentAmount = ethers.parseUnits("100.0", 18);

    await expect(
      proxy
        .connect(payer)
        .payWithToken(ethers.ZeroAddress, paymentAmount, creator.address)
    ).to.be.rejected;
  });

  it("payWithToken should revert when amount is zero", async () => {
    const { proxy, token, creator, payer } =
      await deployFluxPayERC20Fixture();

    await expect(
      proxy
        .connect(payer)
        .payWithToken(await token.getAddress(), 0n, creator.address)
    ).to.be.rejected;
  });

  it("payWithToken should revert when projectCreator address is zero", async () => {
    const { ethers, proxy, proxyAddress, token, payer } =
      await deployFluxPayERC20Fixture();

    const paymentAmount = ethers.parseUnits("100.0", 18);

    await token.mint(payer.address, paymentAmount);
    await token.connect(payer).approve(proxyAddress, paymentAmount);

    await expect(
      proxy
        .connect(payer)
        .payWithToken(await token.getAddress(), paymentAmount, ethers.ZeroAddress)
    ).to.be.rejected;
  });

  it("pause should block payWithToken and unpause should restore ERC20 payment path", async () => {
    const {
      ethers,
      proxy,
      proxyAddress,
      token,
      treasury,
      creator,
      payer,
    } = await deployFluxPayERC20Fixture();

    const paymentAmount = ethers.parseUnits("100.0", 18);

    await token.mint(payer.address, paymentAmount * 2n);
    await token.connect(payer).approve(proxyAddress, paymentAmount * 2n);

    await proxy.pause();

    await expect(
      proxy
        .connect(payer)
        .payWithToken(await token.getAddress(), paymentAmount, creator.address)
    ).to.be.rejected;

    expect(await token.balanceOf(treasury.address)).to.equal(0n);
    expect(await token.balanceOf(creator.address)).to.equal(0n);

    await proxy.unpause();

    await expect(
      proxy
        .connect(payer)
        .payWithToken(await token.getAddress(), paymentAmount, creator.address)
    ).to.not.be.rejected;

    expect(await token.balanceOf(treasury.address)).to.equal(
      ethers.parseUnits("2.5", 18)
    );
    expect(await token.balanceOf(creator.address)).to.equal(
      ethers.parseUnits("97.5", 18)
    );
  });

  it("payWithToken should emit PaymentReceived with correct ERC20 parameters", async () => {
    const {
      ethers,
      proxy,
      proxyAddress,
      token,
      tokenAddress,
      creator,
      payer,
    } = await deployFluxPayERC20Fixture();

    const paymentAmount = ethers.parseUnits("100.0", 18);
    const expectedFee = ethers.parseUnits("2.5", 18);

    await token.mint(payer.address, paymentAmount);
    await token.connect(payer).approve(proxyAddress, paymentAmount);

    await proxy
      .connect(payer)
      .payWithToken(tokenAddress, paymentAmount, creator.address);

    const events = await proxy.queryFilter(
      proxy.filters.PaymentReceived(payer.address, tokenAddress)
    );

    expect(events.length).to.equal(1);
    expect(events[0].args.buyer).to.equal(payer.address);
    expect(events[0].args.token).to.equal(tokenAddress);
    expect(events[0].args.amount).to.equal(paymentAmount);
    expect(events[0].args.fee).to.equal(expectedFee);
  });

  it("payWithETH should emit PaymentReceived with native token marker", async () => {
    const { ethers, proxy, creator, payer } =
      await deployFluxPayERC20Fixture();

    const paymentAmount = ethers.parseEther("1.0");
    const expectedFee = ethers.parseEther("0.025");

    await proxy
      .connect(payer)
      .payWithETH(creator.address, { value: paymentAmount });

    const events = await proxy.queryFilter(
      proxy.filters.PaymentReceived(payer.address, ethers.ZeroAddress)
    );

    expect(events.length).to.equal(1);
    expect(events[0].args.buyer).to.equal(payer.address);
    expect(events[0].args.token).to.equal(ethers.ZeroAddress);
    expect(events[0].args.amount).to.equal(paymentAmount);
    expect(events[0].args.fee).to.equal(expectedFee);
  });

  it("updateConfig should emit ConfigUpdated with correct parameters", async () => {
    const { proxy, newTreasury } = await deployFluxPayERC20Fixture();

    await proxy.updateConfig(newTreasury.address, 300);

    const events = await proxy.queryFilter(
      proxy.filters.ConfigUpdated(newTreasury.address)
    );

    expect(events.length).to.equal(1);
    expect(events[0].args.treasuryWallet).to.equal(newTreasury.address);
    expect(events[0].args.feeRate).to.equal(300n);
  });

  it("deployProxy initialize should emit ProductionLocked and initial ConfigUpdated", async () => {
    const { proxy, treasury } = await deployFluxPayERC20Fixture();

    const productionLockedEvents = await proxy.queryFilter(
      proxy.filters.ProductionLocked()
    );

    expect(productionLockedEvents.length).to.equal(1);

    const configUpdatedEvents = await proxy.queryFilter(
      proxy.filters.ConfigUpdated(treasury.address)
    );

    expect(configUpdatedEvents.length).to.equal(1);
    expect(configUpdatedEvents[0].args.treasuryWallet).to.equal(
      treasury.address
    );
    expect(configUpdatedEvents[0].args.feeRate).to.equal(250n);
  });
});