# @paladinfi/agentkit-actions

**Pre-trade composed risk gate for Coinbase AgentKit agents** — OFAC SDN + GoPlus token security + Etherscan source verification + anomaly heuristics + lookalike detection. Single x402-paid call against [PaladinFi](https://swap.paladinfi.com) on Base.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chain](https://img.shields.io/badge/chain-Base%208453-2563eb)](https://basescan.org/)
[![npm](https://img.shields.io/badge/npm-v0.1.0-cb3837)](https://www.npmjs.com/package/@paladinfi/agentkit-actions)
[![CI](https://github.com/paladinfi/agentkit-actions/actions/workflows/ci.yml/badge.svg)](https://github.com/paladinfi/agentkit-actions/actions/workflows/ci.yml)

---

## Why this vs. AgentKit's built-in `x402ActionProvider`?

AgentKit ships a generic `x402ActionProvider` that lets your agent make HTTP-via-x402 calls to any URL. This package is different: it packages a single domain intent — *"check this token's risk before swapping"* — with built-in safety constants the generic transport can't enforce. Specifically, the paid path validates the server's 402 challenge against hard-coded constants (Base USDC contract, PaladinFi treasury address, `$0.01` max amount, EIP-3009 only — no Permit2, ≤10-min validity window) **before viem signs anything**. A compromised PaladinFi server cannot redirect a signed authorization to a different recipient, asset, or chain.

If you mount AgentKit's `x402ActionProvider` alongside this one, note that the generic provider's `make_http_request_with_x402` action can also call `/v1/trust-check` directly — but **does not** apply our pre-sign hook. Funds are still bounded by the server's declared price ($0.001), so this is not a drain vector, but the safety guarantee only holds via this package's `paladin_trust_check` action.

## Quick start (preview mode)

```bash
npm install @paladinfi/agentkit-actions
# or pnpm add / bun add
```

```ts
import { AgentKit } from "@coinbase/agentkit";
import { paladinTrustActionProvider } from "@paladinfi/agentkit-actions";
import { getLangChainTools } from "@coinbase/agentkit-langchain"; // or getVercelAITools

const agentkit = await AgentKit.from({
  walletProvider, // your existing EvmWalletProvider on Base
  actionProviders: [
    paladinTrustActionProvider(), // mode: "preview" by default
    // ...your other providers
  ],
});

const tools = await getLangChainTools(agentkit);
// or: const tools = await getVercelAITools(agentkit);
```

The agent now has a `paladin_trust_check` tool. When the LLM decides to use it (e.g., before a `swap` action), it'll call `/v1/trust-check/preview` (free) and get back a recommendation.

Preview responses are sample fixtures: every factor has `real: false` and the recommendation is `sample-` prefixed (`sample-allow` / `sample-warn` / `sample-block`) so a screenshot cannot be cropped into a misleading "real" assessment. Paid responses **omit** the `real` field per factor (the schema defaults absent values to `true`) and use plain `allow`/`warn`/`block`.

## Paid mode wiring

**Cost: $0.001 USDC per call. Fund your AgentKit wallet provider's address with ~$0.10 USDC (~100 calls of headroom) on Base. ETH is not required from the agent — x402 EIP-3009 settlement is gasless from the signer's perspective; the facilitator pays gas.**

```ts
import { AgentKit } from "@coinbase/agentkit";
import { paladinTrustActionProvider } from "@paladinfi/agentkit-actions";

const agentkit = await AgentKit.from({
  walletProvider, // ANY EvmWalletProvider on Base mainnet (Viem, CDP, Privy, etc.)
  actionProviders: [
    paladinTrustActionProvider({ mode: "paid" }),
  ],
});
```

That's it. The action provider extracts a viem `LocalAccount` from your wallet provider via `walletProvider.toSigner()` automatically — no separate wiring needed. If your wallet provider is a smart-contract wallet (e.g., CdP smart wallet) without `signTypedData`, the call will fail with a clear error.

**Pre-sign safety.** Every paid call validates the server's 402 challenge against hard-coded constants (Base USDC `0x833589fC...02913`, treasury `0xeA8C33d0...834b4`, `$0.01` amount cap, EIP-3009 only, ≤10-min validity, EIP-712 domain check). If any field deviates, the call aborts client-side **before viem signs**, with an error prefixed `paladin-trust BLOCKED pre-sign:` so operators can grep / alert. See [`src/x402/validate.ts`](./src/x402/validate.ts).

**Boot-time validation.** `paladinTrustActionProvider({ walletClientAccount: ... })` (the v0.0.x wiring) now THROWS — paid mode is now wired automatically through your AgentKit wallet provider. See Migration below.

## Migration from v0.0.x

- **Default factory call still works** — `paladinTrustActionProvider()` continues to give you preview mode with no config changes. Mount it the same way you did in v0.0.x.
- **Paid mode wiring changed.** v0.0.x suggested passing `walletClientAccount` to the factory; v0.1.0 routes paid mode through the AgentKit wallet provider's signer automatically. Pass `{ mode: "paid" }` and that's it. Passing `walletClientAccount` now THROWS with a clear migration message.
- **Factory return type changed.** v0.0.x returned a `customActionProvider`-shaped object; v0.1.0 returns a `PaladinActionProvider` class instance. Both implement `ActionProvider` so `actionProviders: [paladinTrustActionProvider()]` continues to work. Code that reached into the v0.0.x return value's internals will break.
- **Schema simplified.** `chainId` removed from `paladin_trust_check` input — provider is Base-only via `supportsNetwork` and the API request injects `chainId: 8453` internally. v0.0.x callers passing `{ address, chainId: 8453 }` keep working (extra field ignored).
- **`@coinbase/agentkit` is now a peerDep, pinned exact `0.10.4`.** Match this in your project's deps. AgentKit's API is stabilizing; expect to bump the pin as new minors land.
- **Action name unchanged.** `paladin_trust_check` continues to register. (Internally we override `getActions()` to strip the class-name prefix the `@CreateAction` decorator unconditionally applies — surfaced name stays clean.)

## What it does

| Factor | Source | Cadence |
|---|---|---|
| **OFAC SDN screening** | U.S. Treasury SDN XML feed (cryptocurrency-tagged via Feature 345 / Detail 1432) | PaladinFi service refreshes from Treasury every 24 hours |
| **GoPlus token security** | GoPlus trust-list + token-security API | On-call (recently-deployed contracts may not yet be classified) |
| **Etherscan source verification** | Etherscan `getSourceCode` | Cached per `(address, chainId)` |
| **Anomaly heuristics** | Fresh-deploy / low-holder / proxy patterns | On-call |
| **Lookalike detection** | Symbol/name proximity vs known-asset whitelist + recently-active tokens | On-call |

Returns `recommendation: allow | warn | block` plus per-factor breakdown. The intended pattern: agent abstains on `block`, surfaces a warning on `warn`, proceeds on `allow`.

## Modes

| Mode | Endpoint | Cost | Returns |
|---|---|---|---|
| `preview` (default) | `POST /v1/trust-check/preview` | Free, no auth, no payment | Sample fixture (`real: false`, `recommendation` is `sample-` prefixed) |
| `paid` | `POST /v1/trust-check` | $0.001 USDC/call settled via x402 on Base | Live evaluation (factors return without `real` field, schema defaults to `true`; `recommendation` ∈ `{allow, warn, block}`) |

## Sister package

[`@paladinfi/eliza-plugin-trust`](https://www.npmjs.com/package/@paladinfi/eliza-plugin-trust) ships the same trust-check semantic for ElizaOS agents. Both packages share the same security architecture (hard-coded constants, pre-sign hook, scrubbed errors) and a CI drift check enforces byte-for-byte parity on the security-critical files.

## Security & disclosures

- **Non-custodial**: PaladinFi never holds, signs, or moves user funds. Every paid trust-check is settled by the calling wallet's own EIP-3009 signature against the published USDC contract on Base.
- **Pre-sign hard constants**: paid mode signs only against `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base USDC) → `0xeA8C33d018760D034384e92D1B2a7cf0338834b4` (PaladinFi treasury), max $0.01/call, EIP-3009 only.
- **Sample fixture defense**: preview responses are explicitly marked (`_preview: true`, `recommendation: "sample-..."`, every factor `real: false`) so they cannot be screenshot-cropped into a misleading "real" assessment.
- **Coverage caveats**: GoPlus signals are a leading indicator — recently-deployed contracts may not yet be classified. Out-of-scope today: LP-lock status, deployer rug history, pump-dump/wash-trade signals.
- **Chain coverage**: Base (chainId 8453) only. `supportsNetwork` rejects all other networks.
- **Library trust**: x402 settlement uses [`@x402/fetch@2.11.0`](https://www.npmjs.com/package/@x402/fetch) + [`@x402/evm@2.11.0`](https://www.npmjs.com/package/@x402/evm), Apache-2.0, maintained by the x402 Foundation.
- **AgentKit alpha drift**: tested against `@coinbase/agentkit@0.10.4`. AgentKit's API is still evolving; expect to bump the pin as new minors land.
- **Vulnerability disclosure**: see [`SECURITY.md`](./SECURITY.md) for the disclosure path. Email `dev@paladinfi.com`; do not open public Issues for security findings.

## Operator

Operated by **Malcontent Games LLC**, doing business as **PaladinFi**.

- Public API: https://swap.paladinfi.com
- Health: https://swap.paladinfi.com/health
- Terms: https://paladinfi.com/terms/
- Privacy: https://paladinfi.com/privacy/

## License

MIT — see [LICENSE](./LICENSE).
