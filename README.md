# @paladinfi/agentkit-actions

**Pre-trade composed risk gate for Coinbase AgentKit agents** — OFAC SDN + GoPlus token security + Etherscan source verification + anomaly heuristics + lookalike detection. Single x402-paid call against [PaladinFi](https://swap.paladinfi.com) on Base.

> **v0.0.1 is a skeleton release** that ships as a thin wrapper around AgentKit's `customActionProvider()` factory. **v0.1.0** will graduate to a proper `PaladinActionProvider extends ActionProvider` class with the full v2-alpha idiomatic surface (decorator-based actions, `supportsNetwork` checks, and integration with AgentKit's in-tree `x402ActionProvider` for paid x402 settlement).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chain](https://img.shields.io/badge/chain-Base%208453-2563eb)](https://basescan.org/)
[![Status](https://img.shields.io/badge/status-skeleton%20v0.0.1-orange)](https://github.com/paladinfi/agentkit-actions)

---

## What it does

Adds the `paladin_trust_check` action to your AgentKit agent. When invoked (typically before a swap), the agent calls [PaladinFi](https://swap.paladinfi.com) to run a composed risk check on a buy-token contract:

| Factor | Source | Cadence |
|---|---|---|
| **OFAC SDN screening** | U.S. Treasury SDN XML feed (cryptocurrency-tagged via Feature 345 / Detail 1432) | Service refreshes from Treasury every 24 hours |
| **GoPlus token security** | GoPlus trust-list + token-security API | On-call (recently-deployed contracts may not yet be classified) |
| **Etherscan source verification** | Etherscan `getSourceCode` | Cached per `(address, chainId)` |
| **Anomaly heuristics** | Fresh-deploy / low-holder / proxy patterns | On-call |
| **Lookalike detection** | Symbol/name proximity vs known-asset whitelist + recently-active tokens | On-call |

Returns `recommendation: allow | warn | block` plus per-factor breakdown. The intended pattern: agent abstains on `block`, surfaces a warning on `warn`, proceeds on `allow`.

## Modes

| Mode | Endpoint | Cost | Returns | v0.0.1 status |
|---|---|---|---|---|
| `preview` (default) | `POST /v1/trust-check/preview` | Free, no API key, no payment | Sample fixture (every factor `real: false`, `recommendation` is `sample-` prefixed) | ✅ Implemented |
| `paid` | `POST /v1/trust-check` | $0.001 USDC/call settled via x402 on Base | Live evaluation | ⏳ v0.1.0 (requires AgentKit wallet provider integration for x402 settlement) |

## Install

```bash
npm install @paladinfi/agentkit-actions @coinbase/agentkit
# or
pnpm add @paladinfi/agentkit-actions @coinbase/agentkit
# or
bun add @paladinfi/agentkit-actions @coinbase/agentkit
```

Peer dependency: `@coinbase/agentkit@^0.10.4`.

## Use in an AgentKit setup

```ts
import { AgentKit } from "@coinbase/agentkit";
import { paladinTrustActionProvider } from "@paladinfi/agentkit-actions";

const agentkit = await AgentKit.from({
  walletProvider: yourWalletProvider,
  actionProviders: [
    // ...your other providers (e.g. erc20ActionProvider, x402ActionProvider, etc.)
    paladinTrustActionProvider(),
  ],
});

// The agent now has a `paladin_trust_check` action available for invocation.
// LangChain integration:
const tools = await getLangChainTools(agentkit);
```

## Configuration

Default config targets the live PaladinFi service in preview mode on Base. Override per-call:

```ts
import { paladinTrustActionProvider } from "@paladinfi/agentkit-actions";

const provider = paladinTrustActionProvider({
  apiBase: "https://swap.paladinfi.com", // default
  mode: "preview",                        // default; v0.1.0 supports "paid"
  defaultChainId: 8453,                   // Base; PaladinFi v1 supports Base only
});
```

## Action signature

The action is registered with this schema (Zod):

```ts
{
  address: string,         // EIP-55 hex address of the buy-token contract (required)
  chainId: number,         // EIP-155 chain id (default: 8453 / Base)
  taker: string | undefined // EIP-55 hex address of the agent's wallet (optional; improves anomaly detection)
}
```

**v0.0.1 invocation requires explicit args** (e.g. via the AgentKit `tools.invoke({...})` interface). v0.1.0 will add LLM-prompt extraction so the action fires from natural-language user messages without explicit args.

The `invoke` returns a JSON-formatted string containing:
- `summary` — human-readable one-line verdict
- `recommendation` — `allow | warn | block | sample-allow | sample-warn | sample-block`
- `mode` — `preview` or `paid`
- `response` — full `TrustCheckResponse` object

## Sample preview response (verified live)

```bash
curl -sS -X POST https://swap.paladinfi.com/v1/trust-check/preview \
  -H 'content-type: application/json' \
  -d '{"chainId":8453,"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}'
```

```json
{
  "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "chainId": 8453,
  "request_id": "499895ca-92f6-4b3d-a146-9f902dc34a45",
  "trust": {
    "recommendation": "sample-allow",
    "factors": [
      { "source": "ofac", "signal": "not_listed", "real": false },
      { "source": "etherscan_source", "signal": "verified", "real": false },
      { "source": "goplus", "signal": "ok", "real": false },
      { "source": "anomaly", "signal": "ok", "real": false }
    ],
    "_preview": true,
    "_message": "Preview response — SAMPLE FIXTURE. POST /v1/trust-check (x402-paid, $0.001/call) for live evaluation."
  }
}
```

## Why use this when AgentKit already has `x402ActionProvider`?

AgentKit's in-tree `x402ActionProvider` solves the **payment plumbing** (handling 402 challenges, EIP-3009 USDC settlement, retry flows). This package adds the **trust-verification semantic layer** on top — composed OFAC + GoPlus + Etherscan + anomaly + lookalike signals returned in a single deterministic verdict so the agent can abstain on `block` without composing those signals itself.

Once v0.1.0 ships, this package will use AgentKit's `x402ActionProvider` under the hood for the paid call (the right separation of concerns).

## Security & disclosures

- **Non-custodial**: PaladinFi never holds, signs, or moves user funds.
- **Sample fixture defense**: preview responses are explicitly marked (`_preview: true`, `recommendation: "sample-..."`, every factor `real: false`) so they cannot be screenshot-cropped into a misleading "real" assessment.
- **Coverage caveats** (carried into v0.0.1): GoPlus signals are a leading indicator — recently-deployed contracts may not yet be classified. Out-of-scope today: LP-lock status, deployer rug history, pump-dump/wash-trade signals.
- **Chain coverage**: Base (chainId 8453) only at this time. Other EVMs on roadmap as the underlying feeds expand.

## Roadmap

- **v0.1.0** (~2 weeks from 2026-05-02; deadline 2026-05-16): graduate from `customActionProvider` wrapper to a proper `PaladinActionProvider extends ActionProvider` class with `@CreateAction` decorators. Wire paid x402 settlement via AgentKit's `x402ActionProvider` integration. Add LLM prompt extraction so natural-language messages invoke the action.
- **v0.2.0**: Vitest unit + integration tests matching AgentKit's testing pattern; CI green badge; toon-format / chat-history compatibility if relevant.
- **v0.3.0**: separate `paladin_lookalike_check` action exposed as a standalone hook agents can compose into transfer flows (not just swap).
- **v1.0.0**: production stable, multi-chain, AgentKit native (potentially merged into `coinbase/agentkit/typescript/agentkit/src/action-providers/paladin/` as an in-tree provider via PR).

## Eliza analogue

For ElizaOS agents, see [@paladinfi/eliza-plugin-trust](https://www.npmjs.com/package/@paladinfi/eliza-plugin-trust) — same trust-check semantic, different framework conventions.

## Contributing

Open issues / PRs at https://github.com/paladinfi/agentkit-actions.

## Operator

Operated by **Malcontent Games LLC**, doing business as **PaladinFi**.

- Public API: https://swap.paladinfi.com
- Health: https://swap.paladinfi.com/health
- MCP Registry: `io.github.paladinfi/paladin-swap`
- Smithery: https://smithery.ai/servers/paladinfi/paladin-swap
- Terms: https://paladinfi.com/terms/
- Privacy: https://paladinfi.com/privacy/

## License

MIT — see [LICENSE](./LICENSE).
