import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const FluxPayModule = buildModule("FluxPayModule", (m) => {
  // 仅仅部署逻辑合约
  const fluxPay = m.contract("FluxPayProcessor");

  return { fluxPay };
});

export default FluxPayModule;