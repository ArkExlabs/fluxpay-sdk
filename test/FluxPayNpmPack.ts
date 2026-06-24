// @ts-nocheck
import { describe, it } from "node:test";
import { expect } from "chai";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function run(command: string, cwd = process.cwd()): string {
  return execSync(command, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
    windowsHide: true,
    shell: process.platform === "win32" ? process.env.ComSpec : undefined,
  });
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findPackedTarball(): string {
  const files = fs.readdirSync(process.cwd());

  const tarballs = files
    .filter((file) => /^fluxpay-sdk-.*\.tgz$/.test(file))
    .sort();

  if (tarballs.length === 0) {
    throw new Error("No fluxpay-sdk npm pack tarball found");
  }

  return tarballs[tarballs.length - 1];
}

function cleanupPackedTarballs() {
  for (const file of fs.readdirSync(process.cwd())) {
    if (/^fluxpay-sdk-.*\.tgz$/.test(file)) {
      fs.rmSync(path.join(process.cwd(), file), { force: true });
    }
  }
}

describe("FluxPay v0.3.5 NPM Pack Dry Run + Consumer Import Fixture", () => {
  it("npm pack should include expected package files only", () => {
    cleanupPackedTarballs();

    run("npm run build:clean");
    run("npm pack");

    const tarball = findPackedTarball();
    const tarballPath = path.join(process.cwd(), tarball);

    expect(fs.existsSync(tarballPath)).to.equal(true);

    const packListJson = run("npm pack --dry-run --json");
    const packList = JSON.parse(packListJson);

    expect(packList.length).to.equal(1);

    const files = packList[0].files.map((entry: any) => entry.path).sort();

    const requiredFiles = [
      "README.md",
      "abi/FluxPayProcessor.v0.2.8.abi.json",
      "abi/FluxPayProcessor.v0.2.8.interface.json",
      "dist/FluxPay.d.ts",
      "dist/FluxPay.d.ts.map",
      "dist/FluxPay.js",
      "dist/FluxPay.js.map",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "dist/index.js.map",
      "package.json",
    ];

    for (const requiredFile of requiredFiles) {
      expect(files).to.include(requiredFile);
    }

    const forbiddenPrefixes = [
      "contracts/",
      "test/",
      "scripts/",
      "artifacts/",
      "cache/",
      "node_modules/",
      ".env",
    ];

    for (const file of files) {
      for (const forbiddenPrefix of forbiddenPrefixes) {
        expect(
          file.startsWith(forbiddenPrefix),
          `${file} should not be packed`
        ).to.equal(false);
      }
    }

    cleanupPackedTarballs();
  });

  it("packed package should be installable and importable from a consumer fixture", () => {
    cleanupPackedTarballs();

    run("npm run build:clean");
    run("npm pack");

    const tarball = findPackedTarball();
    const tarballPath = path.join(process.cwd(), tarball);

    const fixtureDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "fluxpay-consumer-")
    );

    fs.writeFileSync(
      path.join(fixtureDir, "package.json"),
      JSON.stringify(
        {
          name: "fluxpay-consumer-fixture",
          version: "0.0.0",
          private: true,
          type: "module",
          dependencies: {
            ethers: "^6.15.0",
          },
          devDependencies: {
            typescript: "~6.0.3",
          },
          scripts: {
            build: "tsc -p tsconfig.json",
            start: "node index.mjs",
          },
        },
        null,
        2
      ),
      "utf8"
    );

    fs.writeFileSync(
      path.join(fixtureDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            skipLibCheck: true,
            esModuleInterop: true,
            resolveJsonModule: true,
            noEmit: true,
          },
          include: ["index.ts"],
        },
        null,
        2
      ),
      "utf8"
    );

    fs.writeFileSync(
      path.join(fixtureDir, "index.ts"),
      [
        'import { FluxPay, type FluxPayClientConfig, type FluxPayPaymentResult } from "fluxpay-sdk";',
        'import FluxPayAbi from "fluxpay-sdk/abi/FluxPayProcessor.v0.2.8.abi.json" with { type: "json" };',
        'import { ethers } from "ethers";',
        "",
        "const randomWallet = ethers.Wallet.createRandom();",
        "",
        "const config: FluxPayClientConfig = {",
        '  contractAddress: "0x0000000000000000000000000000000000000001",',
        "  abi: FluxPayAbi,",
        "  signer: randomWallet,",
        "};",
        "",
        "const client = FluxPay.connect(config);",
        "",
        "const address: string = client.getContractAddress();",
        "",
        "const result: FluxPayPaymentResult | null = null;",
        "",
        "if (address.length !== 42) {",
        '  throw new Error("Unexpected address length");',
        "}",
        "",
        "console.log('consumer import fixture ok', result);",
      ].join("\n"),
      "utf8"
    );

    fs.writeFileSync(
      path.join(fixtureDir, "index.mjs"),
      [
        'import { FluxPay } from "fluxpay-sdk";',
        'import FluxPayAbi from "fluxpay-sdk/abi/FluxPayProcessor.v0.2.8.abi.json" with { type: "json" };',
        'import { ethers } from "ethers";',
        "",
        "const randomWallet = ethers.Wallet.createRandom();",
        "",
        "const client = FluxPay.connect({",
        '  contractAddress: "0x0000000000000000000000000000000000000001",',
        "  abi: FluxPayAbi,",
        "  signer: randomWallet,",
        "});",
        "",
        "if (client.getContractAddress() !== '0x0000000000000000000000000000000000000001') {",
        '  throw new Error("consumer runtime import failed");',
        "}",
        "",
        "console.log('consumer runtime import fixture ok');",
      ].join("\n"),
      "utf8"
    );

    run(`npm install "${tarballPath.replace(/\\/g, "\\\\")}"`, fixtureDir);
    run("npm run build", fixtureDir);
    const runtimeOutput = run("npm run start", fixtureDir);

    expect(runtimeOutput).to.include("consumer runtime import fixture ok");

    cleanupPackedTarballs();
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("package metadata should remain npm-publish guarded", () => {
    const packageJson = readJson(path.join(process.cwd(), "package.json"));

    expect(packageJson.name).to.equal("fluxpay-sdk");
    expect(packageJson.version).to.equal("0.3.4");
    expect(packageJson.private).to.equal(true);
    expect(packageJson.main).to.equal("./dist/index.js");
    expect(packageJson.types).to.equal("./dist/index.d.ts");

    expect(packageJson.peerDependencies.ethers).to.be.a("string");
    expect(packageJson.peerDependencies.ethers).to.match(/^\^6\.\d+\.\d+$/);
  });
});