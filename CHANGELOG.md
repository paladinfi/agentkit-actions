# Changelog

All notable changes to `@paladinfi/agentkit-actions` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-05-10

Doc-only patch. No code or runtime changes — paired distribution artifact for PaladinFi server v0.11.73 (per Distribution Discipline Gate). v0.1.0 customers see no behavior change beyond what the server-side v0.11.73 contract change already delivers.

### Changed

- **README**: removed stale "lookalike detection" feature claim (lede + "What it does" table). Lookalike-symbol detection was removed from PaladinFi production in server v0.11.62 (2026-05-04); the README was not updated at that time.
- **README**: paid-mode response semantics now document the v0.11.73 fail-closed contract. When an underlying source (OFAC, anomaly heuristics, scam-intel) is temporarily unreachable, the factor is included with `real: false` and `signal: "unreachable"`, contributing 0 to `risk_score`. If all sources are unreachable, the response returns `recommendation: "warn"` instead of the prior `recommendation: "allow"` (closes a silent-allow vector that existed since server v0.11.50).
- **README**: added Security & disclosures bullet documenting server v0.11.73 contract reference + behavior change advisory for clients keying off `recommendation: "allow"`.
- **package.json**: description updated to drop stale "lookalike" reference; `keywords` removed `"lookalike"` entry.

## [0.1.0] - 2026-05-04

First functional release. Graduates from `customActionProvider` thin wrapper to a proper `PaladinActionProvider extends ActionProvider<EvmWalletProvider>` with `@CreateAction` decorator + paid x402 settlement. Mirrors security architecture of sister package `@paladinfi/eliza-plugin-trust@0.1.0` (same hard-coded constants, same 6-check pre-sign hook, same `scrubViemError` pattern).

Audit trail: plan v1 REQUIRES-MAJOR-REWRITE (Engineering H1 wallet-adapter, H2 import-type) → plan v2 with all convergent fixes → plan v2 re-review APPROVE-WITH-MINOR-FIXES (Engineering) → minor fixes applied (action-name override, chainId injection) → implementation. Memory: `eliza_outbound_2026-05-02.md` Lesson 7, `feedback_no_deploy_without_adversarial_review.md`.

### Added

- **Class-based `PaladinActionProvider`** with `@CreateAction`-decorated `paladinTrustCheck` method.
- **Paid x402 settlement** via `@x402/fetch@2.11.0` + `@x402/evm@2.11.0` + `@x402/core@2.11.0` (all pinned exact). Uses `walletProvider.toSigner()` directly (NOT a hand-rolled adapter — the v1 plan's adapter was rejected by all 3 reviewers; AgentKit's `EvmWalletProvider.toSigner()` is the canonical path).
- **6-check pre-sign hook** via `onBeforePaymentCreation` running `validatePaladinContext`. Closes wallet-drain, Permit2 downgrade, x402 v1 downgrade, long-lived signature, EIP-712 domain spoof. Hook-abort errors carry `paladin-trust BLOCKED pre-sign:` prefix.
- **`getActions()` overridden** to strip the class-name prefix the `@CreateAction` decorator unconditionally applies. Surfaced `Action.name` is `paladin_trust_check` (matches v0.0.x); storage key stays prefixed (collision-safe).
- **`supportsNetwork`** restricted to Base mainnet (`protocolFamily === "evm" && networkId === "base-mainnet"`) — matches in-tree convention (compoundActionProvider, basenameActionProvider, etc.).
- **HTTPS gate inside `PaladinTrustClient` constructor** — defense in depth; direct `new PaladinTrustClient({ mode: "paid", apiBase: "http://..." })` throws.
- **Per-invocation paid client construction** — each call gets fresh hook + scheme registration bound to THIS invocation's wallet. ~ms overhead; security-isolation win.
- **`scripts/check-drift.mjs`** + `prepublishOnly` hook — diffs `x402/{constants,validate}.ts` + `errors.ts` byte-for-byte against sister package `@paladinfi/eliza-plugin-trust`. npm publish fails on divergence.
- **35/36 unit tests pass** across `tests/x402-validate.test.ts` (17 — same as sister), `tests/boot-validation.test.ts` (11 — including supportsNetwork edge cases + legacy-wiring throw), `tests/action-binding.test.ts` (7 of 8 — the skipped one needs real AgentKit decorator metadata pipeline; covered by smoke).

### Changed

- **Schema simplified**: `chainId` dropped from `trustCheckRequestSchema`. Provider is Base-only via `supportsNetwork`; redundant field invited LLM hallucination. Schema is now `{ address, taker? }`. Internal API request still includes `chainId: 8453` (injected by the action handler).
- **`@coinbase/agentkit` peerDep pinned exact `0.10.4`** (was `^0.10.4`).
- **`@x402/{core,evm,fetch}` deps pinned exact `2.11.0`**.
- **Added `reflect-metadata` dep** — required for the `@CreateAction` decorator's runtime metadata.

### Breaking changes (vs v0.0.x)

- **Factory return type**: `paladinTrustActionProvider()` now returns a `PaladinActionProvider` class instance (was a `customActionProvider`-shaped object). Both implement `ActionProvider`, so `actionProviders: [paladinTrustActionProvider()]` continues to work. Code that reached into the v0.0.x return value's internals will break.
- **`paladinTrustActionProvider({ walletClientAccount: ... })` now THROWS** (was silently demoted to preview). v0.0.x docs suggested this wiring path; v0.1.0 routes paid mode through the AgentKit wallet provider's `toSigner()` automatically. Mount with `actionProviders: [paladinTrustActionProvider({ mode: "paid" })]` and the wallet provider is wired via the action method's first arg.
- **Schema**: action input no longer includes `chainId`. v0.0.x callers passing `{ address, chainId: 8453 }` continue to work because Zod unknown-key handling permits extra fields, but the field is ignored — `chainId` is internally hard-coded to 8453.

### Verified

- `npm run typecheck` clean
- `npm run build` clean
- `npm run check-drift` clean (sister package parity verified byte-for-byte)
- `npm run test` — 35/36 pass (1 skipped, covered by smoke)
- **Manual paid smoke against live `/v1/trust-check`** with permanent test wallet (Account 4) succeeded. `recommendation: allow`, 5 real factors. Smoke imports `PaladinTrustClient` directly (not from index) due to upstream sushi/viem incompat in `@coinbase/agentkit`'s transitive deps — see Known Issues below.
- Plan + implementation each passed 3-adversary review per `feedback_no_deploy_without_adversarial_review.md`. Plan v1 REQUIRES-MAJOR-REWRITE, v2 APPROVE-WITH-MINOR-FIXES (re-review).

### Known issues

- **Sushi/viem transitive incompatibility (test-environment only).** Our `smoke-paid.mjs` imports `PaladinTrustClient` directly from `./dist/client.js` (not from `./dist/index.js`) because the action-provider import chain pulls in `@coinbase/agentkit`'s barrel which transitively loads `sushi/chains.ts`, whose viem-chain references are stale in some viem versions. In normal AgentKit consumer setups, AgentKit's own `node_modules/@coinbase/agentkit/node_modules/viem` resolves the right chain symbols and there is no consumer-facing impact.

## [0.0.2] - 2026-05-03

Retrospective adversarial-review patch. Caught by 3-adversary review (Engineering+Security + Maintainer) on the v0.0.1 ship after the deploy-without-review gap was codified (per PaladinFi internal rule established 2026-05-02: no public-surface deploy without 3-adversary review).

### Fixed

- **Config merge handles explicit `undefined` correctly.** v0.0.1 used `{...DEFAULT_CONFIG, ...userConfig}` which let `paladinTrustActionProvider({apiBase: undefined})` shadow the default with undefined, causing `Failed to parse URL from undefined/v1/...` at invoke time. v0.0.2 uses `userConfig.x ?? DEFAULT_CONFIG.x` per-field. (Caught by retrospective review M1.)
- **`paid` mode now gracefully degrades to `preview` with a one-time `console.warn`.** v0.0.1 threw at invoke-time if `mode: "paid"` was passed — but the README documents paid mode as a config option. v0.0.2 silently downgrades + warns once. v0.1.0 wires real paid x402 settlement.
- **HTTPS enforcement on `apiBase`.** v0.0.1 accepted any URL scheme. v0.0.2 rejects non-HTTPS bases unless `PALADIN_TRUST_ALLOW_INSECURE=1` is set (testnet/dev) or the host is `localhost`/`127.0.0.1`.
- **`recommendation` Zod schema tightened from `z.string()` to `z.enum(TRUST_RECOMMENDATIONS)`.** v0.0.1 accepted arbitrary strings — a server-side typo would silently pass validation and the agent would branch on it. v0.0.2 fails parse on unrecognized values.
- **README x402ActionProvider claim corrected.** v0.0.1 said "v0.1.0 will use AgentKit's x402ActionProvider under the hood" — but `x402ActionProvider` is an agent-level HTTP toolkit, not a library to be called from inside another provider's invoke. v0.0.2 README correctly says v0.1.0 will use the same `@x402/fetch` settlement library AgentKit's in-tree `x402ActionProvider` uses.
- **README roadmap now flags v0.1.0 as a breaking change.** The factory→class migration changes the returned shape; v0.0.x consumers should pin to `^0.0.1`.
- **Dropped `x402` from `keywords`.** v0.0.x doesn't actually implement x402 settlement (it's preview-only). The keyword would mislead npm search results. Will return in v0.1.0.
- **`CHANGELOG.md` now included in published tarball.** v0.0.1's `files` array omitted it.

### No breaking changes for v0.0.1 consumers

- Config-merge fix is regression-safe: callers passing fully-defined config see no change. Only callers passing explicit `undefined` see the new (correct) behavior.
- `paid` mode degrade is silent; existing callers with `mode: "paid"` now succeed instead of fail.
- HTTPS enforcement only fires on misconfigured `apiBase`. Default config is HTTPS already.
- Zod tightening only fails on responses the server should never return.

### Verified

- Adversarial review on v0.0.1 (4 reviewers in parallel: Engineering+Security and Maintainer for each of `eliza-plugin-trust` and the sister `agentkit-actions`).
- All HIGH-sev findings from review applied; one MED deferred (viem version skew across consumer's tree — ecosystem-wide, not addressable in this package).
- `tsc --noEmit` clean.
- `npm run build` emits clean dist.
- `node smoke-test.mjs` 7/7 checks pass against live API.

## [0.0.1] - 2026-05-02

Initial **skeleton release**. Sister package to `@paladinfi/eliza-plugin-trust` — same trust-check semantic, AgentKit framework conventions.

### Added

- TypeScript ESM package targeting `@coinbase/agentkit@^0.10.4` (peerDep).
- `paladinTrustActionProvider({apiBase, mode, defaultChainId})` factory that returns a configured `customActionProvider` with the `paladin_trust_check` action.
- `PaladinTrustClient` class with `preview()` (live; sample-fixture endpoint) and `paid()` (throws — implementation lands in v0.1.0).
- Zod schemas for `TrustCheckRequest` / `TrustCheckResponse` / `TrustBlock` / `TrustFactor`.
- README with install instructions, "Use in an AgentKit setup" example, configuration table, response shape docs, security disclosures, roadmap.
- MIT LICENSE.
- `smoke-test.mjs` with 7 checks against live API.

### Intentional v0.0.1 simplifications

- Thin wrapper around AgentKit's `customActionProvider()` factory rather than a proper `PaladinActionProvider extends ActionProvider` class with `@CreateAction` decorators. The class-based pattern lands in v0.1.0.
- Preview endpoint only — paid x402 settlement requires AgentKit wallet-provider integration which lands in v0.1.0.

[0.0.2]: https://github.com/paladinfi/agentkit-actions/releases/tag/v0.0.2
[0.0.1]: https://github.com/paladinfi/agentkit-actions/releases/tag/v0.0.1
