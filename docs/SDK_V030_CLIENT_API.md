\# FluxPay v0.3.0 SDK Client API



\## Scope



v0.3.0 restructures the TypeScript SDK client without changing the contract ABI.



The SDK continues to connect to the FluxPay proxy address.



\---



\## Preferred Constructor



```ts

const fluxPay = FluxPay.connect({

&#x20; contractAddress: proxyAddress,

&#x20; abi: FluxPayProcessorAbi,

&#x20; signer,

});

