/**
 * @paladinfi/agentkit-actions
 *
 * Pre-trade composed risk gate for Coinbase AgentKit agents — OFAC SDN +
 * GoPlus + Etherscan + lookalike via x402-paid PaladinFi API on Base.
 *
 * v0.0.1 is a SKELETON release that ships as a thin wrapper around AgentKit's
 * `customActionProvider()` factory. v0.1.0 will graduate to a proper
 * `PaladinActionProvider extends ActionProvider` class with the full v2-alpha
 * idiomatic surface (decorator-based actions, network supportsNetwork checks,
 * and integration with AgentKit's `x402ActionProvider` for paid settlement).
 *
 * Live PaladinFi service: https://swap.paladinfi.com (Base mainnet, chainId 8453).
 * Free preview at POST /v1/trust-check/preview returns sample-fixture trust
 * blocks for request-shape validation without payment or API key.
 *
 * Eliza analogue: `@paladinfi/eliza-plugin-trust` ships the same trust-check
 * semantic for ElizaOS agents.
 */

import { customActionProvider } from "@coinbase/agentkit";
import { PaladinTrustClient } from "./client.js";
import {
  DEFAULT_CONFIG,
  type PaladinTrustConfig,
  trustCheckRequestSchema,
  type TrustCheckRequest,
} from "./types.js";

export { PaladinTrustClient } from "./client.js";
export type {
  PaladinTrustConfig,
  TrustBlock,
  TrustCheckRequest,
  TrustCheckResponse,
  TrustFactor,
  TrustFactorSource,
  TrustRecommendation,
} from "./types.js";
export {
  DEFAULT_CONFIG,
  TRUST_FACTOR_SOURCES,
  TRUST_RECOMMENDATIONS,
  trustBlockSchema,
  trustCheckRequestSchema,
  trustCheckResponseSchema,
  trustFactorSchema,
} from "./types.js";

const ACTION_NAME = "paladin_trust_check";

const ACTION_DESCRIPTION =
  "Pre-trade composed risk gate on a token + taker. Calls PaladinFi /v1/trust-check " +
  "(OFAC SDN screening from U.S. Treasury XML refreshed every 24h, GoPlus token security, " +
  "Etherscan source verification, anomaly heuristics, lookalike detection). Returns a single " +
  "verdict (`allow` / `warn` / `block`) plus per-factor breakdown so the agent can abstain " +
  "on `block` before signing any swap. v0.0.1 calls the FREE preview endpoint (sample fixture); " +
  "v0.1.0 will wire the paid x402 endpoint via AgentKit's wallet provider.";

/**
 * Factory returning a configured `customActionProvider` for the
 * `paladin_trust_check` action. Drop into your AgentKit setup alongside
 * other action providers.
 *
 * @example
 * ```ts
 * import { AgentKit } from "@coinbase/agentkit";
 * import { paladinTrustActionProvider } from "@paladinfi/agentkit-actions";
 *
 * const agentkit = await AgentKit.from({
 *   walletProvider,
 *   actionProviders: [
 *     paladinTrustActionProvider(),
 *     // ...your other providers
 *   ],
 * });
 * ```
 *
 * @param userConfig - Optional partial config. Defaults to the live PaladinFi
 *   service in preview mode on Base (chainId 8453).
 */
export function paladinTrustActionProvider(
  userConfig: Partial<PaladinTrustConfig> = {},
) {
  const config: PaladinTrustConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };

  const client = new PaladinTrustClient(config);

  return customActionProvider({
    name: ACTION_NAME,
    description: ACTION_DESCRIPTION,
    schema: trustCheckRequestSchema,
    invoke: async (args: TrustCheckRequest): Promise<string> => {
      if (config.mode === "paid") {
        throw new Error(
          "paladin_trust_check paid mode is not implemented in v0.0.1. " +
            "Set mode to 'preview' or wait for v0.1.0.",
        );
      }

      const response = await client.preview(args);

      const verdict = response.trust.recommendation;
      const factorSummary = response.trust.factors
        .map((f) => `${f.source}=${f.signal}${f.real ? "" : " (sample)"}`)
        .join(" / ");
      const summary = `paladin_trust_check (${config.mode}) for ${args.address} on chainId ${args.chainId}: recommendation=${verdict}. Factors: ${factorSummary}.`;

      return JSON.stringify(
        {
          summary,
          recommendation: verdict,
          mode: config.mode,
          response,
        },
        null,
        2,
      );
    },
  });
}

export default paladinTrustActionProvider;
