// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

async function deployFluxPayFixture() {
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

  return {
    connection,
    ethers,
    upgradesApi,
    proxy,
    owner,
    treasury,
    creator,
    payer,
    attacker,
    newTreasury,
  };
}

describe("FluxPay v0.2.1 Security Regression Test Pack", () => {
  it("non-owner cannot update config", async () => {
    const { proxy, attacker, newTreasury } = await deployFluxPayFixture();

    await expect(
      proxy.connect(attacker).updateConfig(newTreasury.address, 300)
    ).to.be.rejected;

    expect(await proxy.feeRate()).to.equal(250n);
  });

  it("non-owner cannot pause or unpause", async () => {
    const { proxy, attacker } = await deployFluxPayFixture();

    await expect(proxy.connect(attacker).pause()).to.be.rejected;
    expect(await proxy.paused()).to.equal(false);

    await proxy.pause();
    expect(await proxy.paused()).to.equal(true);

    await expect(proxy.connect(attacker).unpause()).to.be.rejected;
    expect(await proxy.paused()).to.equal(true);
  });

  it("feeRate greater than MAX_FEE_RATE must revert during initialize and updateConfig", async () => {
    const connection = await hre.network.create();
    const { ethers } = connection;
    const upgradesApi = await upgrades(hre, connection);

    const [owner, treasury] = await ethers.getSigners();
    const FluxPayFactory = await ethers.getContractFactory("FluxPayProcessor");

    await expect(
      upgradesApi.deployProxy(
        FluxPayFactory,
        [owner.address, treasury.address, 1001],
        {
          kind: "uups",
          initializer: "initialize",
        }
      )
    ).to.be.rejected;

    const { proxy, newTreasury } = await deployFluxPayFixture();

    await expect(proxy.updateConfig(newTreasury.address, 1001)).to.be.rejected;
    expect(await proxy.feeRate()).to.equal(250n);
  });

  it("zero treasury address must revert during initialize and updateConfig", async () => {
    const connection = await hre.network.create();
    const { ethers } = connection;
    const upgradesApi = await upgrades(hre, connection);

    const [owner] = await ethers.getSigners();
    const FluxPayFactory = await ethers.getContractFactory("FluxPayProcessor");

    await expect(
      upgradesApi.deployProxy(
        FluxPayFactory,
        [owner.address, ethers.ZeroAddress, 250],
        {
          kind: "uups",
          initializer: "initialize",
        }
      )
    ).to.be.rejected;

    const { proxy } = await deployFluxPayFixture();

    await expect(proxy.updateConfig(ethers.ZeroAddress, 250)).to.be.rejected;
  });

  it("zero projectCreator address must revert for ETH payment", async () => {
    const { ethers, proxy, payer } = await deployFluxPayFixture();

    await expect(
      proxy
        .connect(payer)
        .payWithETH(ethers.ZeroAddress, { value: ethers.parseEther("0.1") })
    ).to.be.rejected;
  });

  it("zero msg.value must revert for ETH payment", async () => {
    const { proxy, payer, creator } = await deployFluxPayFixture();

    await expect(
      proxy.connect(payer).payWithETH(creator.address, { value: 0n })
    ).to.be.rejected;
  });

  it("pause must block ETH payment and unpause must restore payment path", async () => {
    const { ethers, proxy, payer, creator } = await deployFluxPayFixture();

    await proxy.pause();

    await expect(
      proxy
        .connect(payer)
        .payWithETH(creator.address, { value: ethers.parseEther("0.1") })
    ).to.be.rejected;

    await proxy.unpause();

    await expect(
      proxy
        .connect(payer)
        .payWithETH(creator.address, { value: ethers.parseEther("0.1") })
    ).to.not.be.rejected;
  });

  it("implementation contract body cannot be initialized directly", async () => {
    const connection = await hre.network.create();
    const { ethers } = connection;

    const [owner, treasury] = await ethers.getSigners();
    const FluxPayFactory = await ethers.getContractFactory("FluxPayProcessor");

    const implementation = await FluxPayFactory.deploy();
    await implementation.waitForDeployment();

    await expect(
      implementation.initialize(owner.address, treasury.address, 250)
    ).to.be.rejected;
  });

  it("proxy cannot be initialized twice", async () => {
    const { proxy, owner, treasury } = await deployFluxPayFixture();

    await expect(
      proxy.initialize(owner.address, treasury.address, 250)
    ).to.be.rejected;
  });

  it("non-owner cannot upgrade implementation", async () => {
    const { ethers, upgradesApi, proxy, attacker } = await deployFluxPayFixture();

    const V2Factory = await ethers.getContractFactory(
      "FluxPayProcessorV2Mock",
      attacker
    );

    const proxyAddress = await proxy.getAddress();

    await expect(
      upgradesApi.upgradeProxy(proxyAddress, V2Factory)
    ).to.be.rejected;
  });

  it("upgrade to V2 must preserve storage state", async () => {
    const {
      ethers,
      upgradesApi,
      proxy,
      owner,
      treasury,
      newTreasury,
    } = await deployFluxPayFixture();

    await proxy.updateConfig(newTreasury.address, 300);

    expect(await proxy.owner()).to.equal(owner.address);
    expect(await proxy.treasuryWallet()).to.equal(newTreasury.address);
    expect(await proxy.feeRate()).to.equal(300n);
    expect(await proxy.productionLocked()).to.equal(true);
    expect(await proxy.paused()).to.equal(false);

    const V2Factory = await ethers.getContractFactory(
      "FluxPayProcessorV2Mock",
      owner
    );

    const proxyAddress = await proxy.getAddress();

    const upgraded = await upgradesApi.upgradeProxy(proxyAddress, V2Factory);
    await upgraded.waitForDeployment();

    expect(await upgraded.owner()).to.equal(owner.address);
    expect(await upgraded.treasuryWallet()).to.equal(newTreasury.address);
    expect(await upgraded.feeRate()).to.equal(300n);
    expect(await upgraded.productionLocked()).to.equal(true);
    expect(await upgraded.paused()).to.equal(false);
    expect(await upgraded.version()).to.equal("v0.2.1-test-v2");
  });
});