\# FluxPay Testnet Deployment Checklist



\## Scope



This checklist is for FluxPay testnet deployment preparation.



Current target networks:



\- Base Sepolia

\- Arbitrum Sepolia



This checklist is not a mainnet launch checklist.



\---



\## Pre-deployment Requirements



Before deploying to any public testnet, confirm:



\- `git status` is clean.

\- `npx hardhat compile --force` passes.

\- `npx hardhat test` passes.

\- `.env` exists locally and is not committed.

\- `.env.example` is committed.

\- The deployer wallet contains testnet ETH.

\- `FLUXPAY\_FEE\_RATE\_BPS` is less than or equal to `1000`.

\- `FLUXPAY\_TREASURY` is either empty or a valid EVM address.

\- The deployer private key is a testnet-only key.

\- The deployer private key is not reused from a mainnet wallet.



\---



\## Base Sepolia Deployment Command



```powershell

npx hardhat run scripts/deploy-upgradeable.ts --network baseSepolia

