# Changelog

All notable changes to `@paladinfi/agentkit-actions` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
