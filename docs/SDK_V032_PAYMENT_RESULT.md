\# FluxPay v0.3.2 SDK Payment Result Builder + Receipt Normalization



\## Scope



v0.3.2 adds high-level SDK helpers that return normalized parsed results.



No contract ABI changes are introduced.



\---



\## Native Payment Result



```ts

const result = await fluxPay.payNativeAndParse({

&#x20; projectCreator,

&#x20; amount,

});

