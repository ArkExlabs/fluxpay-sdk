# FluxPay SDK

FluxPay is a headless Web3 payment SDK and smart contract payment processor for EVM-compatible chains.

The project provides:

- A UUPS-upgradeable payment processor contract.
- Native-token payment support.
- ERC-20 payment support.
- Treasury fee splitting.
- Typed TypeScript SDK methods.
- Receipt parsing and event decoding helpers.
- Deployment and verification scripts.

> Current status: v0.3.3 developer integration documentation checkpoint.  
> Mainnet status: not mainnet ready.  
> Public testnet status: pending.  
> Persistent local deployment verification: completed.

---

## Core Concept

FluxPay routes a payment into two parts:

```text
gross payment
  ├── treasury fee
  └── project creator net amount