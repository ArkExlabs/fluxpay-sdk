import fs from "node:fs";
import path from "node:path";
import FluxPayArtifact from "../artifacts/contracts/FluxPayProcessor.sol/FluxPayProcessor.json" with { type: "json" };

type AbiItem = {
  type: string;
  name?: string;
  inputs?: Array<{
    name: string;
    type: string;
    indexed?: boolean;
  }>;
  outputs?: Array<{
    name: string;
    type: string;
  }>;
  stateMutability?: string;
};

type InterfaceSummary = {
  contract: string;
  version: string;
  functions: string[];
  events: string[];
  errors: string[];
};

function signatureOf(item: AbiItem): string {
  const inputs = item.inputs ?? [];
  const inputTypes = inputs.map((input) => input.type).join(",");
  return `${item.name ?? "<anonymous>"}(${inputTypes})`;
}

function main() {
  const abi = FluxPayArtifact.abi as AbiItem[];

  const functions = abi
    .filter((item) => item.type === "function")
    .map(signatureOf)
    .sort();

  const events = abi
    .filter((item) => item.type === "event")
    .map(signatureOf)
    .sort();

  const errors = abi
    .filter((item) => item.type === "error")
    .map(signatureOf)
    .sort();

  const summary: InterfaceSummary = {
    contract: "FluxPayProcessor",
    version: "0.2.8",
    functions,
    events,
    errors,
  };

  const outputDir = path.join(process.cwd(), "abi");

  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, "FluxPayProcessor.v0.2.8.abi.json"),
    `${JSON.stringify(abi, null, 2)}\n`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(outputDir, "FluxPayProcessor.v0.2.8.interface.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  console.log("ABI snapshot exported.");
  console.log(`Functions: ${functions.length}`);
  console.log(`Events: ${events.length}`);
  console.log(`Errors: ${errors.length}`);
}

main();