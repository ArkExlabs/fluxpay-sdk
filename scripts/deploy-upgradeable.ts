import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

async function main() {
  const connection = await hre.network.create();
  const { ethers } = connection;
  const upgradesApi = await upgrades(hre, connection);

  const [deployer] = await ethers.getSigners();

  const treasury =
    process.env.FLUXPAY_TREASURY && process.env.FLUXPAY_TREASURY.length > 0
      ? process.env.FLUXPAY_TREASURY
      : deployer.address;

  const feeRate = Number(process.env.FLUXPAY_FEE_RATE_BPS ?? "250");

  console.log("Deploying FluxPayProcessor UUPS proxy...");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Initial owner: ${deployer.address}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Fee rate BPS: ${feeRate}`);

  const FluxPayProcessor = await ethers.getContractFactory(
    "FluxPayProcessor"
  );

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
  console.log("Deployment complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});