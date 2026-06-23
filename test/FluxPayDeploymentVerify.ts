// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import { execSync } from "node:child_process";

const SUMMARY_PREFIX = "FLUXPAY_VERIFY_SUMMARY_JSON:";

function runVerifyScriptWithDryRunDeployment() {
  const command = "npx hardhat run scripts/verify-deployment.ts";

  const stdout = execSync(command, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FLUXPAY_VERIFY_DRY_RUN_DEPLOY: "true",
      FLUXPAY_FEE_RATE_BPS: "250",
      FLUXPAY_EXPECTED_FEE_RATE_BPS: "250",
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
    throw new Error(`Verify summary line not found in stdout:\n${stdout}`);
  }

  return {
    stdout,
    summary: JSON.parse(summaryLine.slice(SUMMARY_PREFIX.length)),
  };
}

describe("FluxPay v0.2.6 Testnet Deployment Verify Script + Address Registry Seed", () => {
  it("verify-deployment.ts should dry-run deploy and verify sane proxy state", () => {
    const { stdout, summary } = runVerifyScriptWithDryRunDeployment();

    expect(stdout).to.include("Verifying FluxPayProcessor deployment...");
    expect(stdout).to.include("Deployment verification passed.");

    expect(summary.networkName).to.be.a("string");
    expect(summary.networkName.length).to.be.greaterThan(0);
    expect(summary.chainId).to.match(/^[0-9]+$/);

    expect(summary.proxyAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    expect(summary.owner).to.match(/^0x[a-fA-F0-9]{40}$/);
    expect(summary.treasury).to.match(/^0x[a-fA-F0-9]{40}$/);

    expect(summary.proxyAddress).to.not.equal(
      "0x0000000000000000000000000000000000000000"
    );

    expect(summary.owner).to.not.equal(
      "0x0000000000000000000000000000000000000000"
    );

    expect(summary.treasury).to.not.equal(
      "0x0000000000000000000000000000000000000000"
    );

    expect(summary.feeRate).to.equal("250");
    expect(summary.productionLocked).to.equal(true);
    expect(summary.paused).to.equal(false);
    expect(summary.dryRunDeploy).to.equal(true);
    expect(summary.expectedOwnerMatched).to.equal(null);
    expect(summary.expectedTreasuryMatched).to.equal(null);
    expect(summary.expectedFeeRateMatched).to.equal(true);
  });
});