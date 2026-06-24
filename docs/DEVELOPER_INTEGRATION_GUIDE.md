\# FluxPay Developer Integration Guide



\## Scope



This guide explains how an application developer should integrate FluxPay after the v0.3.3 SDK documentation checkpoint.



This guide assumes:



\- The FluxPay contract has already been deployed through a UUPS proxy.

\- The developer has the FluxPay proxy address.

\- The developer has the FluxPay ABI.

\- The developer has an ethers signer.



\---



\## Integration Rule



Always connect to:



```text

proxyAddress

