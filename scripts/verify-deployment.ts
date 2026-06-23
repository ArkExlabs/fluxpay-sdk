import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

type VerifySummary = {
  networkName: string;
  chainId: string;
  proxyAddress: string;
  owner: string;
  treasury: string;
  feeRate: string;
  productionLocked: boolean;
  paused: boolean;
  dryRunDeploy: boolean;
  expectedOwnerMatched: boolean | null;
  expectedTreasuryMatched: boolean | null;
  expectedFeeRateMatched: boolean | null;
};

const SUMMARY_PREFIX = "FLUXPAY_VERIFY_SUMMARY_JSON:";

function resolveRequestedNetworkName(): string {
  const networkEqualArg = process.argv.find((arg) =>
    arg.startsWith("--network=")
  );

  if (networkEqualArg) {
    return networkEqualArg.split("=")[1] || "unknown";
  }

  const networkFlagIndex = process.argv.findIndex(
    (arg) => arg === "--network" || arg === "-n"
  );

  if (
    networkFlagIndex >= 0 &&
    process.argv[networkFlagIndex + 1] !== undefined
  ) {
    return process.argv[networkFlagIndex + 1];
  }

  return process.env.HARDHAT_NETWORK ?? "default";
}

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

function getOptionalEnvAddress(
  ethers: any,
  envName: string
): string | undefined {
  const value = process.env[envName];

  if (!value || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!ethers.isAddress(trimmed)) {
    throw new Error(`${envName} must be a valid EVM address`);
  }

  return trimmed;
}

async function deployDryRunProxy(ethers: any, upgradesApi: any) {
  const [deployer] = await ethers.getSigners();

  const treasury =
    process.env.FLUXPAY_TREASURY && process.env.FLUXPAY_TREASURY.trim().length > 0
      ? process.env.FLUXPAY_TREASURY.trim()
      : deployer.address;

  if (!ethers.isAddress(treasury)) {
    throw new Error("FLUXPAY_TREASURY must be a valid EVM address");
  }

  const feeRate = parseFeeRateBps(process.env.FLUXPAY_FEE_RATE_BPS);

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

  return await proxy.getAddress();
}

async function main() {
  const connection = await hre.network.create();
  const { ethers } = connection;
  const upgradesApi = await upgrades(hre, connection);

  const network = await ethers.provider.getNetwork();

  const networkName = resolveRequestedNetworkName();
  const chainId = network.chainId.toString();

  const dryRunDeploy =
    process.env.FLUXPAY_VERIFY_DRY_RUN_DEPLOY === "true" ||
    process.env.FLUXPAY_VERIFY_DRY_RUN_DEPLOY === "1";

  const proxyAddress = dryRunDeploy
    ? await deployDryRunProxy(ethers, upgradesApi)
    : process.env.FLUXPAY_PROXY_ADDRESS?.trim();

  if (!proxyAddress || !ethers.isAddress(proxyAddress)) {
    throw new Error(
      "FLUXPAY_PROXY_ADDRESS must be set to a valid deployed proxy address, unless FLUXPAY_VERIFY_DRY_RUN_DEPLOY=true"
    );
  }

  console.log("Verifying FluxPayProcessor deployment...");
  console.log(`Network: ${networkName}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`Proxy address: ${proxyAddress}`);
  console.log(`Dry-run deploy: ${dryRunDeploy}`);

  const proxy = await ethers.getContractAt("FluxPayProcessor", proxyAddress);

  const owner = await proxy.owner();
  const treasury = await proxy.treasuryWallet();
  const feeRate = await proxy.feeRate();
  const productionLocked = await proxy.productionLocked();
  const paused = await proxy.paused();

  if (!ethers.isAddress(owner) || owner === ethers.ZeroAddress) {
    throw new Error("Verify failed: owner is invalid");
  }

  if (!ethers.isAddress(treasury) || treasury === ethers.ZeroAddress) {
    throw new Error("Verify failed: treasury is invalid");
  }

  if (feeRate > 1000n) {
    throw new Error("Verify failed: feeRate exceeds 1000 bps");
  }

  if (productionLocked !== true) {
    throw new Error("Verify failed: productionLocked is not true");
  }

  if (paused !== false) {
    throw new Error("Verify failed: paused is not false");
  }

  const expectedOwner = getOptionalEnvAddress(ethers, "FLUXPAY_EXPECTED_OWNER");
  const expectedTreasury = getOptionalEnvAddress(
    ethers,
    "FLUXPAY_EXPECTED_TREASURY"
  );

  const expectedFeeRateRaw = process.env.FLUXPAY_EXPECTED_FEE_RATE_BPS;
  const expectedFeeRate =
    expectedFeeRateRaw && expectedFeeRateRaw.trim().length > 0
      ? parseFeeRateBps(expectedFeeRateRaw)
      : undefined;

  const expectedOwnerMatched =
    expectedOwner === undefined ? null : owner === expectedOwner;

  const expectedTreasuryMatched =
    expectedTreasury === undefined ? null : treasury === expectedTreasury;

  const expectedFeeRateMatched =
    expectedFeeRate === undefined ? null : feeRate === BigInt(expectedFeeRate);

  if (expectedOwnerMatched === false) {
    throw new Error("Verify failed: owner does not match FLUXPAY_EXPECTED_OWNER");
  }

  if (expectedTreasuryMatched === false) {
    throw new Error(
      "Verify failed: treasury does not match FLUXPAY_EXPECTED_TREASURY"
    );
  }

  if (expectedFeeRateMatched === false) {
    throw new Error(
      "Verify failed: feeRate does not match FLUXPAY_EXPECTED_FEE_RATE_BPS"
    );
  }

  const summary: VerifySummary = {
    networkName,
    chainId,
    proxyAddress,
    owner,
    treasury,
    feeRate: feeRate.toString(),
    productionLocked,
    paused,
    dryRunDeploy,
    expectedOwnerMatched,
    expectedTreasuryMatched,
    expectedFeeRateMatched,
  };

  console.log("Deployment verification passed.");
  console.log(`${SUMMARY_PREFIX}${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});