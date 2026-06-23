\# FluxPay Deployment Manifest Policy



\## Purpose



FluxPay uses OpenZeppelin Upgrades for UUPS proxy deployment.



OpenZeppelin upgrade manifests must be handled carefully because they record proxy and implementation deployment metadata used for future upgrades.



\---



\## Local Manifests



Do not commit local development manifests.



Ignored local manifests:



\- `.openzeppelin/hardhat.json`

\- `.openzeppelin/localhost.json`

\- `.openzeppelin/unknown-\*.json`, except explicitly allowed testnet chain IDs



Local deployment records are disposable.



\---



\## Public Testnet Manifests



Public testnet manifests may be committed intentionally after a real testnet deployment.



Currently allowed testnet manifests:



\- `.openzeppelin/baseSepolia.json`

\- `.openzeppelin/arbitrumSepolia.json`

\- `.openzeppelin/unknown-84532.json`

\- `.openzeppelin/unknown-421614.json`



If OpenZeppelin generates an `unknown-84532.json` or `unknown-421614.json` manifest, it should be reviewed and renamed or documented before being treated as canonical.



\---



\## Mainnet Manifests



Mainnet manifests must only be committed after:



\- Deployment transaction is confirmed.

\- Proxy address is verified.

\- Implementation address is verified.

\- Owner / governance address is verified.

\- Treasury address is verified.

\- Upgrade admin policy is documented.

\- Release tag is created.



Mainnet manifests must not be edited manually.



\---



\## Manual Editing Policy



Do not manually edit OpenZeppelin manifest files unless there is a documented recovery process.



If a manifest conflict appears:



1\. Stop deployment.

2\. Commit current source state.

3\. Back up the manifest.

4\. Identify proxy and implementation addresses on-chain.

5\. Reconcile with OpenZeppelin Upgrades tooling.

6\. Document the recovery action.



\---



\## Current v0.2.x Policy



For v0.2.x:



\- Local manifests are ignored.

\- Base Sepolia and Arbitrum Sepolia manifests are allowed.

\- No mainnet deployment is allowed.

\- No production private key should be used.

