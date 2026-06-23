import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

type DeploymentSummary = {
  proxyAddress: string;
  deployer: string;
  owner: string;
  treasury: string;
  feeRate: string;
  productionLocked: boolean;
  paused: boolean;
  implementationInitializeBlocked: boolean;
};

function parseFeeRateBps(rawValue: string | undefined): number {
  const value = Number(rawValue ?? "250");

  if (!Number.isInteger(value)) {
    throw new Error("FLUXPAY_FEE_RATE_BPS must be an integer");
  }

  if (value < 0) {
    throw new Error("FLUXPAY_FEE_RATE_BPS must be non-negative");
  }

  if (value > 1000) {
    throw new Error("FLUXPAY_FEE_RATE_BPS must not exceed 1000 bps");
  }

  return value;
}

async function main() {
  const connection = await hre.network.create();
  const { ethers } = connection;
  const upgradesApi = await upgrades(hre, connection);

  const [deployer] = await ethers.getSigners();

  const treasury =
    process.env.FLUXPAY_TREASURY && process.env.FLUXPAY_TREASURY.trim().length > 0
      ? process.env.FLUXPAY_TREASURY.trim()
      : deployer.address;

  if (!ethers.isAddress(treasury)) {
    throw new Error("FLUXPAY_TREASURY must be a valid EVM address");
  }

  const feeRate = parseFeeRateBps(process.env.FLUXPAY_FEE_RATE_BPS);

  console.log("Deploying FluxPayProcessor UUPS proxy...");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Initial owner: ${deployer.address}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Fee rate BPS: ${feeRate}`);

  const FluxPayProcessor = await ethers.getContractFactory("FluxPayProcessor");

  const proxy = await upgradesApi.deployProxy(
    FluxPayProcessor,
    [deployer.address, treasury, feeRate],
    {
      kind: "uups",
      initializer: "initialize",
    }
  );

  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();

  console.log(`FluxPayProcessor proxy deployed at: ${proxyAddress}`);

  const owner = await proxy.owner();
  const treasuryWallet = await proxy.treasuryWallet();
  const feeRateOnchain = await proxy.feeRate();
  const productionLocked = await proxy.productionLocked();
  const paused = await proxy.paused();

  if (owner !== deployer.address) {
    throw new Error("Deployment sanity failed: owner mismatch");
  }

  if (treasuryWallet !== treasury) {
    throw new Error("Deployment sanity failed: treasury mismatch");
  }

  if (feeRateOnchain !== BigInt(feeRate)) {
    throw new Error("Deployment sanity failed: feeRate mismatch");
  }

  if (productionLocked !== true) {
    throw new Error("Deployment sanity failed: productionLocked is not true");
  }

  if (paused !== false) {
    throw new Error("Deployment sanity failed: paused is not false");
  }

  const rawImplementation = await FluxPayProcessor.deploy();
  await rawImplementation.waitForDeployment();

  let implementationInitializeBlocked = false;

  try {
    await rawImplementation.initialize(deployer.address, treasury, feeRate);
  } catch {
    implementationInitializeBlocked = true;
  }

  if (!implementationInitializeBlocked) {
    throw new Error(
      "Deployment sanity failed: implementation body can be initialized directly"
    );
  }

  const summary: DeploymentSummary = {
    proxyAddress,
    deployer: deployer.address,
    owner,
    treasury: treasuryWallet,
    feeRate: feeRateOnchain.toString(),
    productionLocked,
    paused,
    implementationInitializeBlocked,
  };

  console.log("Deployment sanity checks passed.");
  console.log(`FLUXPAY_DEPLOYMENT_SUMMARY_JSON:${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});