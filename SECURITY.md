# Security Policy

## Reporting a Vulnerability

If you discover a security issue in `@paladinfi/agentkit-actions` or in the hosted PaladinFi endpoints this provider calls, please email **[dev@paladinfi.com](mailto:dev@paladinfi.com)** with:

- A clear description of the issue + reproduction steps
- The affected action, factory option, file path, or HTTP call path
- Any logs, error responses, or proof-of-concept
- Whether the issue has been disclosed publicly elsewhere

We aim to acknowledge within **5 business days** and provide a triage update within **7 days**. Please do **not** open a public Issue for security-relevant findings.

PaladinFi operates with a small engineering team. We do not currently run a bug bounty.

## Scope

In scope:

- The `@paladinfi/agentkit-actions` npm package and its source in this repository (`src/`)
- The PaladinFi endpoints this provider calls: `swap.paladinfi.com/v1/trust-check` (paid) and `swap.paladinfi.com/v1/trust-check/preview` (free)
- The x402 pre-sign validation in `src/x402/validate.ts` and the hard-coded constants it enforces (Base USDC contract, PaladinFi treasury address, max amount, EIP-3009 only, ≤10-min validity window)
- The `PaladinActionProvider` class and its `paladin_trust_check` action
- The smoke-test scripts in this repository

Out of scope:

- Issues in `@coinbase/agentkit`, `@x402/*`, `viem`, or other upstream dependencies — please report to those projects directly
- Issues that require a malicious customer to opt themselves into harm (e.g., disabling the pre-sign validation in a fork of this package, supplying an `EvmWalletProvider` whose `toSigner()` returns a malicious account)
- Customer-specific OFAC / GoPlus / Etherscan data quality — these are external feeds; correctness disputes go to the source provider
- AgentKit alpha-version drift (the package pins `@coinbase/agentkit@0.10.4`; behavior with newer versions is undefined until we bump the pin)

## Disclosure

After a fix ships, we publish a CHANGELOG entry describing the issue, the fix, and the affected versions. If you reported the issue, we credit you by handle (with your permission) in the CHANGELOG.

## Sister package

`@paladinfi/eliza-plugin-trust` ships the same trust-check semantic for ElizaOS agents and shares the security architecture (pre-sign hard constants, scrubbed errors). Vulnerabilities affecting both packages can be reported once via this channel — we'll patch in lockstep. See https://github.com/paladinfi/eliza-plugin-trust/blob/main/SECURITY.md.
