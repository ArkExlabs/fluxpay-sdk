// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import { execSync } from "node:child_process";

const SUMMARY_PREFIX = "FLUXPAY_DEPLOYMENT_SUMMARY_JSON:";

function runDeploymentScript() {
  const command = "npx hardhat run scripts/deploy-upgradeable.ts";

  const stdout = execSync(command, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FLUXPAY_FEE_RATE_BPS: "250",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    windowsHide: true,
    shell: process.platform === "win32" ? process.env.ComSpec : undefined,
  });

  const summaryLine = stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith(SUMMARY_PREFIX));

  if (!summaryLine) {
    throw new Error(`Deployment summary line not found in stdout:\n${stdout}`);
  }

  return {
    stdout,
    summary: JSON.parse(summaryLine.slice(SUMMARY_PREFIX.length)),
  };
}

describe("FluxPay v0.2.4/v0.2.5 Deployment Script Dry Run + Proxy Address Sanity Pack", () => {
  it("deploy-upgradeable.ts should dry-run successfully and return sane proxy state", () => {
    const { stdout, summary } = runDeploymentScript();

    expect(stdout).to.include("Deploying FluxPayProcessor UUPS proxy...");
    expect(stdout).to.include("Deployment sanity checks passed.");

    expect(summary.networkName).to.be.a("string");
    expect(summary.networkName.length).to.be.greaterThan(0);
    expect(summary.chainId).to.match(/^[0-9]+$/);

    expect(summary.proxyAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    expect(summary.deployer).to.match(/^0x[a-fA-F0-9]{40}$/);
    expect(summary.owner).to.match(/^0x[a-fA-F0-9]{40}$/);
    expect(summary.treasury).to.match(/^0x[a-fA-F0-9]{40}$/);

    expect(summary.proxyAddress).to.not.equal(
      "0x0000000000000000000000000000000000000000"
    );

    expect(summary.owner).to.equal(summary.deployer);
    expect(summary.treasury).to.equal(summary.deployer);
    expect(summary.feeRate).to.equal("250");
    expect(summary.productionLocked).to.equal(true);
    expect(summary.paused).to.equal(false);
    expect(summary.implementationInitializeBlocked).to.equal(true);
  });
});