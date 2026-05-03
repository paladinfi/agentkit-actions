# `@paladinfi/agentkit-actions` v0.1.0 Implementation Plan — v2

**Status:** AWAITING 3-ADVERSARY REVIEW (v2 after v1 hit REQUIRES-MAJOR-REWRITE)
**Drafted:** 2026-05-04 evening (v1 → v2 same evening)
**Sister package:** `@paladinfi/eliza-plugin-trust@0.1.0` shipped 2026-05-04 daytime — same trust-check semantic, same x402 settlement pattern, same hard-coded constants.

## What changed v1 → v2

v1 review verdicts: Engineering **REQUIRES-MAJOR-REWRITE** (H1 wallet-adapter, H2 import-type), Security APPROVE-WITH-MINOR-FIXES (HIGH-1 drift, HIGH-2 x402ActionProvider coexistence), Maintainer APPROVE-WITH-MINOR-FIXES (H1 same, H2 supportsNetwork).

Convergent fixes applied to v2:

1. ✅ **Use `EvmWalletProvider.toSigner()` directly** — delete `wallet-adapter.ts`. All 3 reviewers flagged this. AgentKit ships exactly the adapter we tried to write.
2. ✅ **Import `EvmWalletProvider` as VALUE** (not `import type`). The `@CreateAction` decorator uses `Reflect.getMetadata("design:paramtypes", ...)` which requires the runtime value. With `import type`, paid mode would silently break at first invocation.
3. ✅ **`supportsNetwork` matches in-tree convention**: `network.protocolFamily === "evm" && network.networkId === "base-mainnet"`. Drops the brittle string-vs-number chainId fallback.
4. ✅ **Action name prefixing — RESOLVED by overriding `getActions()`.** Engineering re-review confirmed `actionDecorator.js:30` prefixes UNCONDITIONALLY (`prefixedActionName = ${target.constructor.name}_${params.name}`). To preserve the v0.0.x action name `paladin_trust_check` for LLM tool catalogs (and avoid breaking v0.0.x consumers selecting by name), the class will override `getActions()` to strip the class prefix from the returned `Action.name`. AgentKit's internal storage key stays prefixed (no collision risk); only the surfaced name is unprefixed. See `action-provider.ts` snippet below.
5. ✅ **Action description tightened** — 53 words → ~25 words with explicit "when to use" framing per Maintainer MED-1.
6. ✅ **Drop `chainId` from schema** — provider is Base-only via `supportsNetwork`; redundant field invites LLM hallucination. Schema simplified to just `address` + optional `taker`. Maintainer MED-2.
7. ✅ **Schema-drift detection** — add a `scripts/check-drift.mjs` that diffs `x402/{constants,validate}.ts` + `errors.ts` byte-for-byte against sister package. CI / pre-publish hook fails on divergence. Security HIGH-1.
8. ✅ **README explicit warning on x402ActionProvider coexistence** — Security HIGH-2.
9. ✅ **`reflect-metadata` in deps** — required for `@CreateAction` runtime metadata.
10. ✅ **`@coinbase/agentkit` as peerDep, `@x402/*` as deps** — make the layering explicit.
11. ✅ **`#format` typed `TrustCheckResponse`** — drop `any`. Engineering L1, Maintainer M3.
12. ✅ **README Quick-start uses `AgentKit.from(...)` shape with langchain/vercel-ai-sdk integration** — Maintainer L6.
13. ✅ **CHANGELOG notes factory-return-type change** — `customActionProvider` object → `PaladinActionProvider` class instance. Both `instanceof ActionProvider` so `actionProviders.push(p)` continues to work. Maintainer M4.
14. ✅ **Tests cover AgentKit surface** — `getActions(walletProvider)` returns one action with correct name; `supportsNetwork` edge cases; per-call client construction. Engineering M6.
15. ✅ **`paladinTrustActionProvider({ walletClientAccount })` v0.0.x compat** — when called with a `walletClientAccount` (legacy paid-mode wiring from v0.0.x docs), it now THROWS with a clear message pointing to the AgentKit-native path (don't silently demote). Engineering M5.
16. ✅ **Sequencing revised to 6-8 hr** with both review cycles counted. Engineering L4.

## Goals (must-have for v0.1.0)

1. **Class-based `PaladinActionProvider extends ActionProvider<EvmWalletProvider>`** with `@CreateAction`-decorated method.
2. **Real paid x402 settlement** via `@x402/fetch@2.11.0` + `onBeforePaymentCreation` hook, using `walletProvider.toSigner()` as the viem account.
3. **Same 6-check pre-sign validation** as eliza-plugin-trust (treasury, USDC, BASE_NETWORK, $0.01 amount cap, 10-min validity, EIP-712 domain).
4. **`supportsNetwork()` chain-scoping** to Base mainnet only (matches in-tree convention).
5. **Backwards-compat factory** `paladinTrustActionProvider(opts?)` still works for preview-mode callers; throws clear error if v0.0.x callers pass `walletClientAccount` (the wiring shape changed).

## What stays the same

- Action name `paladin_trust_check` (verify decorator doesn't prefix; if it does, override `getActions()`).
- Sample-fixture preview semantics (`real: false`, `sample-` prefix).
- HTTPS enforcement on `apiBase`.
- Live PaladinFi service URL.

## Architecture

### File structure

```
src/
├── client.ts           [MODIFIED — paid() implementation matching eliza-plugin-trust]
├── config.ts           [NEW — config resolution including HTTPS gate]
├── x402/
│   ├── constants.ts    [NEW — VERBATIM copy from eliza-plugin-trust; drift-checked]
│   └── validate.ts     [NEW — VERBATIM copy of validatePaladinContext; drift-checked]
├── errors.ts           [NEW — VERBATIM copy of scrubViemError; drift-checked]
├── action-provider.ts  [NEW — PaladinActionProvider extends ActionProvider class]
├── types.ts            [MODIFIED — schema simplified; walletClientAccount removed from PaladinTrustConfig]
└── index.ts            [MODIFIED — exports class, factory, constants]

tests/
├── x402-validate.test.ts        [identical 17 assertions as eliza-plugin-trust]
├── boot-validation.test.ts      [HTTPS gate; getActions() asserts; supportsNetwork edge cases]
└── action-binding.test.ts       [NEW — asserts decorator metadata, walletProvider auto-bind, per-call client construction]

scripts/
└── check-drift.mjs              [NEW — diffs x402/{constants,validate}.ts + errors.ts vs sister package; fails on divergence]

PLAN_v0.1.0.md                    [this file]
CHANGELOG.md                      [MODIFIED — promote v0.1.0]
README.md                         [MODIFIED — 4-section structure + AgentKit-shape Quick-start + x402ActionProvider warning]
package.json                      [MODIFIED — version 0.1.0; reflect-metadata dep; @coinbase/agentkit peerDep; @x402/* deps]
```

(NO `wallet-adapter.ts` — using `walletProvider.toSigner()` directly.)

### Component design

**1-3. `x402/constants.ts`, `x402/validate.ts`, `errors.ts`** — VERBATIM byte-for-byte copies from `D:/Documents/Business/AI/PaladinFi/eliza-plugin-trust/src/...`. Same files; same content. The `scripts/check-drift.mjs` enforces this.

**4. `client.ts`** — verbatim mirror of eliza-plugin-trust's `PaladinTrustClient` shape. HTTPS gate in constructor (defense in depth). Hook registration via `onBeforePaymentCreation`. `policies` filter to BASE_NETWORK. `safeParse` on response. Same `HOOK_ABORT_PREFIX = "paladin-trust BLOCKED pre-sign:"` for operator grep.

**5. `config.ts`** — `resolveConfig(userConfig: Partial<PaladinTrustConfig>): PaladinTrustConfig`. Applies defaults + HTTPS enforcement. AgentKit context has no `runtime.getSetting()`-equivalent, so config purely from constructor args + env vars.

**6. `action-provider.ts`** — class with `@CreateAction` decorator. Verified-shape v2:

```ts
import "reflect-metadata";
// IMPORTANT: EvmWalletProvider imported as VALUE, not type. The @CreateAction
// decorator inspects `design:paramtypes` at runtime to wire walletProvider
// auto-binding. With `import type`, paramtype erases to Object and binding fails.
import { ActionProvider, CreateAction, EvmWalletProvider } from "@coinbase/agentkit";
import type { Action, Network } from "@coinbase/agentkit";
import { z } from "zod";
import { PaladinTrustClient } from "./client.js";
import { resolveConfig } from "./config.js";
import {
  trustCheckRequestSchema,
  type PaladinTrustConfig,
  type TrustCheckResponse,
  type TrustCheckRequest,
} from "./types.js";
import { scrubViemError } from "./errors.js";

const ACTION_DESCRIPTION =
  "Pre-trade risk gate: returns `allow`/`warn`/`block` for a token contract on Base before swapping. " +
  "Composed signal (OFAC SDN, GoPlus, Etherscan, lookalike). " +
  "Call this before signing any swap when the buy-token isn't on a hardcoded allowlist.";

export class PaladinActionProvider extends ActionProvider<EvmWalletProvider> {
  readonly #config: PaladinTrustConfig;

  constructor(opts: Partial<PaladinTrustConfig> = {}) {
    super("paladin-trust", []);
    if ((opts as { walletClientAccount?: unknown }).walletClientAccount) {
      throw new Error(
        "[paladin-trust] v0.1.0+ uses the AgentKit wallet provider directly; do NOT pass walletClientAccount. " +
          "Mount this provider with AgentKit.from({ walletProvider, actionProviders: [paladinTrustActionProvider({ mode: 'paid' })] }) " +
          "and the wallet provider's signer is wired automatically.",
      );
    }
    this.#config = resolveConfig(opts);
  }

  @CreateAction({
    name: "paladin_trust_check",
    description: ACTION_DESCRIPTION,
    schema: trustCheckRequestSchema,
  })
  async paladinTrustCheck(
    walletProvider: EvmWalletProvider,
    args: TrustCheckRequest,
  ): Promise<string> {
    // Per-invocation client. Isolation: each call gets a fresh hook registration
    // bound to THIS invocation's wallet. ~ms overhead. Documented in README.
    let client: PaladinTrustClient;
    if (this.#config.mode === "paid") {
      const account = walletProvider.toSigner();
      client = new PaladinTrustClient({ ...this.#config, walletClientAccount: account });
    } else {
      client = new PaladinTrustClient(this.#config);
    }

    // Schema dropped chainId (provider is Base-only via supportsNetwork);
    // inject server-required chainId before the API call.
    const reqWithChain = { ...args, chainId: 8453 };

    let response: TrustCheckResponse;
    try {
      response = this.#config.mode === "paid"
        ? await client.paid(reqWithChain)
        : await client.preview(reqWithChain);
    } catch (e) {
      return JSON.stringify({ error: scrubViemError(e), mode: this.#config.mode });
    }
    return this.#format(response, args);
  }

  supportsNetwork(network: Network): boolean {
    // Match in-tree convention (compoundActionProvider, basenameActionProvider, etc.)
    return network.protocolFamily === "evm" && network.networkId === "base-mainnet";
  }

  // Override getActions() to strip the class-name prefix the @CreateAction
  // decorator applies (storage key stays prefixed; surfaced Action.name is
  // unprefixed so the LLM catalog sees `paladin_trust_check`, matching v0.0.x).
  override getActions(walletProvider: EvmWalletProvider): Action[] {
    const actions = super.getActions(walletProvider);
    const prefix = `${this.constructor.name}_`;
    return actions.map((a) =>
      a.name.startsWith(prefix) ? { ...a, name: a.name.slice(prefix.length) } : a,
    );
  }

  #format(response: TrustCheckResponse, args: TrustCheckRequest): string {
    const verdict = response.trust.recommendation;
    const factorSummary = response.trust.factors
      .map((f) => `${f.source}=${f.signal}${f.real ? "" : " (sample)"}`)
      .join(" / ");
    const summary = `paladin_trust_check (${this.#config.mode}) for ${args.address}: recommendation=${verdict}. Factors: ${factorSummary}.`;
    return JSON.stringify({ summary, recommendation: verdict, mode: this.#config.mode, response }, null, 2);
  }
}
```

**7. `index.ts`** — backwards-compat factory:

```ts
import { PaladinActionProvider } from "./action-provider.js";
import type { PaladinTrustConfig } from "./types.js";

export { PaladinActionProvider } from "./action-provider.js";
export { PaladinTrustClient } from "./client.js";
export { resolveConfig } from "./config.js";
export {
  PALADIN_TREASURY, BASE_USDC, BASE_NETWORK,
  MAX_TRUST_CHECK_AMOUNT, MAX_VALIDITY_SECONDS,
  X402_VERSION, USDC_DOMAIN_NAME, USDC_DOMAIN_VERSION,
  PALADIN_API_DEFAULT,
} from "./x402/constants.js";
export { validatePaladinContext, type ValidationResult } from "./x402/validate.js";
export { scrubViemError } from "./errors.js";
export type {
  PaladinTrustConfig, TrustBlock, TrustCheckRequest, TrustCheckResponse,
  TrustFactor, TrustFactorSource, TrustRecommendation,
} from "./types.js";

export function paladinTrustActionProvider(opts: Partial<PaladinTrustConfig> = {}) {
  return new PaladinActionProvider(opts);
}
export default paladinTrustActionProvider;
```

**8. Schema simplified (`types.ts`)** — drop `chainId` from request schema since provider is Base-only:

```ts
export const trustCheckRequestSchema = z.object({
  address: z.string().refine((v) => isAddress(v as Address, { strict: false }), {
    message: "address must be a valid EVM hex address",
  }),
  taker: z.string()
    .refine((v) => isAddress(v as Address, { strict: false }), {
      message: "taker must be a valid EVM hex address",
    })
    .optional(),
});
// chainId is auto-set to 8453 inside paladinTrustCheck before calling the API
```

**9. Drift check (`scripts/check-drift.mjs`)** — runs as `npm run check-drift`. Compares `src/x402/constants.ts`, `src/x402/validate.ts`, `src/errors.ts` byte-for-byte against `../eliza-plugin-trust/src/...`. Exits 1 on divergence. Wired into `prepublishOnly` script so npm publish fails if drift exists. Also runs in `npm run typecheck` chain.

## Tests

- **`tests/x402-validate.test.ts`** — exact 17 assertions as eliza-plugin-trust.
- **`tests/boot-validation.test.ts`** — 7+ assertions: paid+non-HTTPS apiBase throws; preview mode constructs cleanly; throws if `walletClientAccount` passed (legacy v0.0.x compat error); `supportsNetwork({ protocolFamily: "evm", networkId: "base-mainnet" })` true; same with networkId=base-sepolia false; same with protocolFamily=svm false; `paladinTrustActionProvider()` (legacy factory) returns instanceof PaladinActionProvider.
- **`tests/action-binding.test.ts`** (NEW) — 4+ assertions: `getActions(mockWalletProvider)` returns array of length 1; the action's `name` is `paladin_trust_check` (verify decorator doesn't prefix; if it does, this test catches it); `Reflect.getMetadata(ACTION_DECORATOR_KEY, PaladinActionProvider).get("paladin_trust_check").walletProvider === true`; calling action's `invoke(args)` with mock walletProvider invokes `walletProvider.toSigner` exactly once in paid mode.

## Sequencing (revised 6-8 hours)

1. **Add deps + scaffold** (~15 min) — pin `@x402/{fetch,evm,core}@2.11.0` exact, `reflect-metadata`, `vitest`. `@coinbase/agentkit` peerDep pinned exact. Bump 0.0.2 → 0.1.0.
2. **Copy x402 + errors + drift script** (~30 min) — verbatim from eliza-plugin-trust. Write `scripts/check-drift.mjs`. Wire into `prepublishOnly`.
3. **Config + client** (~30 min) — mirror eliza-plugin-trust's pattern. HTTPS gate, hook, safeParse, scrubViemError.
4. **PaladinActionProvider class** (~45 min) — class with @CreateAction, supportsNetwork. Use walletProvider.toSigner(). Per-call client construction.
5. **Tests** (~45 min) — 17 + 7 + 4 = 28 assertions across 3 files.
6. **Type-check + build** (~15 min).
7. **Smoke against live API** (~30-45 min) — write `smoke-paid.mjs` that constructs an AgentKit `ViemWalletProvider` from the permanent test wallet (Account 4), instantiates `PaladinActionProvider({ mode: "paid" })`, calls the action method directly. Verify settled tx on Basescan.
8. **3-adversary review on IMPLEMENTATION** (~75-105 min) — same role mix as the plan review. Apply MED+HIGH fixes.
9. **README + CHANGELOG** (~45 min) — 4-section README mirror eliza-plugin-trust + AgentKit-shape Quick-start + Maintainer L6 langchain/vercel snippet + x402ActionProvider coexistence warning + factory-return-type change in Migration.
10. **Publish + release** (~20 min) — npm publish (drift check runs as prepublishOnly), GitHub release tag.
11. **AgentKit draft PR** (~30-45 min) — file at `coinbase/agentkit` with description framed as "domain intent on x402 transport." Reference shipped npm package + sister Eliza package + smoke tx hash.

**Realistic total: 6-8 hours** with both review cycles + apply-fixes.

## Risks (revised v2)

- **R1 [LOW] viem/AgentKit `LocalAccount` shape compat.** `walletProvider.toSigner()` is the official path so this is bounded. If `@x402/evm` ever requires a field `toSigner()` doesn't provide, that's an upstream issue to surface.
- **R2 [LOW] AgentKit alpha API drift.** `@coinbase/agentkit` versioning. Mitigation: pin exact in peerDep; document in README.
- **R3 [RESOLVED] Decorator action-name prefixing.** `@CreateAction` unconditionally prefixes (verified in `actionDecorator.js:30`). Resolved by overriding `getActions()` in `PaladinActionProvider` to strip the class prefix from surfaced `Action.name`. Storage key stays prefixed (collision-safe); LLM tool catalog sees clean `paladin_trust_check` name. `tests/action-binding.test.ts` asserts the unprefixed name surfaces.
- **R4 [LOW] Manual paid test cost.** ~$0.005 USDC for 5 settlement test calls. Trivial.
- **R5 [LOW] AgentKit draft PR rejection.** Same as v1; mitigation in PR copy. Maintainer review confirmed shipped artifacts (npm v0.1.0 + sister Eliza package + smoke tx) clear the bar conditional on H1+H2 fixes (which v2 applies).
- **R6 [MED] Schema-drift between sister packages over time.** Verbatim-copy honor system fails as packages evolve independently. Mitigation: drift check script + prepublishOnly hook (Security HIGH-1 fix).
- **R7 [LOW] AgentKit's bundled `x402ActionProvider` exposes a parallel sign path.** Not a funds-loss vector (treasury still hardcoded server-side at $0.001) but bypasses our pre-sign hook. Mitigation: README explicit warning (Security HIGH-2 fix).

## Definition of Done

- [ ] `npm run typecheck` clean
- [ ] `npm run build` clean
- [ ] `npm run check-drift` clean (no divergence vs sister package)
- [ ] `npm run test` — `x402-validate.test.ts` (17) + `boot-validation.test.ts` (≥7) + `action-binding.test.ts` (≥4) all pass
- [ ] **Manual paid smoke against live `/v1/trust-check`** from permanent test wallet (Account 4) succeeds; settled tx hash documented in CHANGELOG
- [ ] **3-adversary review on IMPLEMENTATION** before publish — Engineering + Security + Maintainer; all HIGH/MED-sev fixes applied
- [ ] CHANGELOG v0.1.0 promoted from Unreleased; factory-return-type change noted in Migration
- [ ] README updated: 4-section structure (Why-this / Quick-start / Paid-mode-wiring / Migration) with AgentKit-shape Quick-start + langchain/vercel-ai-sdk integration line + x402ActionProvider coexistence warning + per-invocation construction documentation
- [ ] `package.json`: v0.1.0; `@coinbase/agentkit` peerDep pinned exact; `@x402/*` deps pinned exact; `reflect-metadata` dep; `prepublishOnly: npm run check-drift`
- [ ] Published to npm at v0.1.0
- [ ] GitHub release v0.1.0 tagged
- [ ] AgentKit draft PR filed at `coinbase/agentkit`
- [ ] Tweet 7 (or follow-up reply on Tweet 6) announcing AgentKit availability — through `social-tools/post-tweet-api.mjs` after 3-adversary review

## Adversarial review gate

**v2 plan review (THIS DOCUMENT):** 3-adversary review now. Need 2+ APPROVE verdicts to proceed. Of v1's 3 reviewers, only Engineering returned REQUIRES-MAJOR-REWRITE. v2 addresses both H1 (toSigner) and H2 (import-as-value) directly + all MED items convergent across reviewers.

**After implementation:** SECOND 3-adversary review on actual code BEFORE npm publish. Mandatory.

For Security reviewer: include "treat as audit not code review; if anything could result in funds loss name it explicitly" framing.
