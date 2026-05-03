/**
 * PaladinActionProvider — class-based AgentKit action provider for the
 * `paladin_trust_check` action.
 *
 * Replaces the v0.0.x `customActionProvider` thin wrapper. Mirrors the
 * security architecture of `@paladinfi/eliza-plugin-trust@0.1.0` (same
 * pre-sign hook, same hard-coded constants, same scrubViemError pattern).
 *
 * Key design decisions (from PLAN_v0.1.0.md adversarial review):
 *   - `EvmWalletProvider` imported as VALUE (not type), required for
 *     `@CreateAction` decorator's `Reflect.getMetadata("design:paramtypes")`
 *     to wire `walletProvider` auto-binding correctly. Otherwise paid mode
 *     silently breaks at first invocation.
 *   - `walletProvider.toSigner()` used directly as the viem LocalAccount.
 *     AgentKit ships this; we don't hand-roll an adapter.
 *   - Per-invocation client construction: each call gets a fresh hook
 *     bound to that invocation's wallet. ~ms overhead, security-isolation win.
 *   - `getActions()` overridden to strip the class-name prefix the
 *     `@CreateAction` decorator unconditionally applies, so the surfaced
 *     `Action.name` stays `paladin_trust_check` (matches v0.0.x).
 */

import "reflect-metadata";
import { ActionProvider, CreateAction, EvmWalletProvider } from "@coinbase/agentkit";
import type { Action, Network } from "@coinbase/agentkit";
import { PaladinTrustClient } from "./client.js";
import { resolveConfig } from "./config.js";
import {
  trustCheckRequestSchema,
  type PaladinTrustConfig,
  type TrustCheckRequest,
  type TrustCheckResponse,
  type TrustCheckApiRequest,
} from "./types.js";
import { scrubViemError } from "./errors.js";

const ACTION_DESCRIPTION =
  "Pre-trade risk gate: returns `allow`/`warn`/`block` for a token contract on Base before swapping. " +
  "Composed signal (OFAC SDN, GoPlus, Etherscan, lookalike). " +
  "Call this before signing any swap when the buy-token isn't on a hardcoded allowlist. " +
  "If the recommendation is `block`, refuse the swap. If `warn`, surface the factor breakdown to the user before proceeding. " +
  "Free in preview mode (sample fixtures), $0.001 USDC per call in paid mode (settled via x402 on Base).";

export class PaladinActionProvider extends ActionProvider<EvmWalletProvider> {
  readonly #config: PaladinTrustConfig;

  constructor(opts: Partial<PaladinTrustConfig> = {}) {
    super("paladin-trust", []);
    if ((opts as { walletClientAccount?: unknown }).walletClientAccount !== undefined) {
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
    let client: PaladinTrustClient;
    if (this.#config.mode === "paid") {
      // AgentKit bundles its own viem (verified 2026-05-04: AgentKit 0.10.4
      // → viem ~2.x; we pin viem 2.21.0). LocalAccount has differently-named
      // experimental fields (signAuthorization vs experimental_signAuthorization)
      // but signTypedData is shape-compatible across viem 2.x. @x402/evm/exact
      // calls only `signer.address` and `signer.signTypedData(…)` (verified at
      // node_modules/@x402/evm/dist/cjs/exact/client/index.js:651,700), so the
      // cast is safe in the eip3009 path our validator hard-restricts to.
      const account = walletProvider.toSigner() as unknown as import("viem/accounts").LocalAccount;
      // Defensive runtime guard — if a wallet provider returns something that
      // looks like a LocalAccount but lacks signTypedData (e.g., a smart-contract
      // wallet), throw NOW rather than fail mid-x402-flow with a leaky error.
      if (typeof account.signTypedData !== "function") {
        throw new Error(
          "[paladin-trust] walletProvider.toSigner() did not return a LocalAccount with signTypedData. " +
            "Smart-contract wallets are not supported in v0.1.0; use a viem `privateKeyToAccount` or compatible local signer.",
        );
      }
      client = new PaladinTrustClient({ ...this.#config, walletClientAccount: account });
    } else {
      client = new PaladinTrustClient(this.#config);
    }

    // Schema dropped chainId (provider is Base-only via supportsNetwork);
    // inject server-required chainId here. Auto-populate `taker` from the
    // wallet provider — LLM-supplied taker invites hallucination + drift from
    // the wallet that's actually signing.
    const taker = args.taker ?? walletProvider.getAddress();
    const apiReq: TrustCheckApiRequest = {
      address: args.address,
      chainId: this.#config.defaultChainId,
      ...(taker ? { taker } : {}),
    };

    let response: TrustCheckResponse;
    try {
      response = this.#config.mode === "paid"
        ? await client.paid(apiReq)
        : await client.preview(apiReq);
    } catch (e) {
      return JSON.stringify({ error: scrubViemError(e), mode: this.#config.mode });
    }
    return this.#format(response, args);
  }

  supportsNetwork(network: Network): boolean {
    // Match in-tree convention (compoundActionProvider, basenameActionProvider)
    return network.protocolFamily === "evm" && network.networkId === "base-mainnet";
  }

  /**
   * Strip the class-name prefix the `@CreateAction` decorator unconditionally
   * applies to action names. Storage key stays prefixed (collision-safe);
   * surfaced `Action.name` is unprefixed.
   */
  // Hardcoded prefix instead of `this.constructor.name` — Engineering L-3
  // flagged that subclasses would silently no-op the strip. Only this class
  // gets its prefix stripped; subclasses are out of scope for v0.1.0.
  override getActions(walletProvider: EvmWalletProvider): Action[] {
    const actions = super.getActions(walletProvider);
    const PREFIX = "PaladinActionProvider_";
    return actions.map((a) =>
      a.name.startsWith(PREFIX) ? { ...a, name: a.name.slice(PREFIX.length) } : a,
    );
  }

  #format(response: TrustCheckResponse, args: TrustCheckRequest): string {
    const verdict = response.trust.recommendation;
    const factorSummary = response.trust.factors
      .map((f) => `${f.source}=${f.signal}${f.real ? "" : " (sample)"}`)
      .join(" / ");
    const summary = `paladin_trust_check (${this.#config.mode}) for ${args.address}: recommendation=${verdict}. Factors: ${factorSummary}.`;
    return JSON.stringify(
      {
        summary,
        recommendation: verdict,
        mode: this.#config.mode,
        response,
      },
      null,
      2,
    );
  }
}
