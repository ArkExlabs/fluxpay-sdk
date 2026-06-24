// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runBuild() {
  execSync("npm run build:clean", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    windowsHide: true,
    shell: process.platform === "win32" ? process.env.ComSpec : undefined,
  });
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

describe("FluxPay v0.3.4 Package Export Structure + Build Output Validation", () => {
  it("npm build should emit package entrypoint JavaScript and declarations", () => {
    runBuild();

    const distDir = path.join(process.cwd(), "dist");

    const expectedFiles = [
      "index.js",
      "index.d.ts",
      "index.js.map",
      "index.d.ts.map",
      "FluxPay.js",
      "FluxPay.d.ts",
      "FluxPay.js.map",
      "FluxPay.d.ts.map"
    ];

    for (const expectedFile of expectedFiles) {
      const fullPath = path.join(distDir, expectedFile);
      expect(fs.existsSync(fullPath), `${expectedFile} should exist`).to.equal(
        true
      );
    }
  });

  it("dist index should export FluxPay SDK symbols", () => {
    runBuild();

    const indexJs = readText(path.join(process.cwd(), "dist", "index.js"));
    const indexDts = readText(path.join(process.cwd(), "dist", "index.d.ts"));

    expect(indexJs).to.include("from \"./FluxPay.js\"");
    expect(indexDts).to.include("FluxPay");
    expect(indexDts).to.include("FluxPayClientConfig");
    expect(indexDts).to.include("FluxPayPaymentResult");
    expect(indexDts).to.include("FluxPayConfigUpdateResult");
  });

  it("package.json should expose dist entrypoint and ABI snapshots", () => {
    const packageJson = JSON.parse(
      readText(path.join(process.cwd(), "package.json"))
    );

    expect(packageJson.type).to.equal("module");
    expect(packageJson.main).to.equal("./dist/index.js");
    expect(packageJson.types).to.equal("./dist/index.d.ts");

    expect(packageJson.exports["."].import).to.equal("./dist/index.js");
    expect(packageJson.exports["."].types).to.equal("./dist/index.d.ts");

    expect(
      packageJson.exports["./abi/FluxPayProcessor.v0.2.8.abi.json"]
    ).to.equal("./abi/FluxPayProcessor.v0.2.8.abi.json");

    expect(
      packageJson.exports["./abi/FluxPayProcessor.v0.2.8.interface.json"]
    ).to.equal("./abi/FluxPayProcessor.v0.2.8.interface.json");
  });

  it("build output should not include tests or scripts", () => {
    runBuild();

    const distEntries = fs.readdirSync(path.join(process.cwd(), "dist"));

    expect(distEntries).to.not.include("test");
    expect(distEntries).to.not.include("scripts");
    expect(distEntries).to.not.include("hardhat.config.js");
  });
});