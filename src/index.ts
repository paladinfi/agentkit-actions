/**
 * @paladinfi/agentkit-actions
 *
 * Pre-trade composed risk gate for Coinbase AgentKit agents — OFAC SDN +
 * GoPlus + Etherscan + lookalike via x402-paid PaladinFi API on Base.
 *
 * v0.1.0 graduates from the v0.0.x `customActionProvider` thin wrapper to a
 * proper class-based `PaladinActionProvider extends ActionProvider<EvmWalletProvider>`
 * with `@CreateAction` decorator + paid x402 settlement via `walletProvider.toSigner()`.
 *
 * Sister package: `@paladinfi/eliza-plugin-trust` ships the same trust-check
 * semantic for ElizaOS agents.
 *
 * Live PaladinFi service: https://swap.paladinfi.com (Base mainnet, chainId 8453).
 */

import { PaladinActionProvider } from "./action-provider.js";
import type { PaladinTrustConfig } from "./types.js";

export { PaladinActionProvider } from "./action-provider.js";
export { PaladinTrustClient } from "./client.js";
export { resolveConfig } from "./config.js";
export {
  PALADIN_TREASURY,
  BASE_USDC,
  BASE_NETWORK,
  MAX_TRUST_CHECK_AMOUNT,
  MAX_VALIDITY_SECONDS,
  X402_VERSION,
  USDC_DOMAIN_NAME,
  USDC_DOMAIN_VERSION,
  PALADIN_API_DEFAULT,
} from "./x402/constants.js";
export { validatePaladinContext, type ValidationResult } from "./x402/validate.js";
export { scrubViemError } from "./errors.js";
export type {
  PaladinTrustConfig,
  TrustBlock,
  TrustCheckRequest,
  TrustCheckApiRequest,
  TrustCheckResponse,
  TrustFactor,
  TrustFactorSource,
  TrustRecommendation,
} from "./types.js";
export { DEFAULT_CONFIG, TRUST_FACTOR_SOURCES, TRUST_RECOMMENDATIONS, trustBlockSchema, trustCheckRequestSchema, trustCheckResponseSchema, trustFactorSchema } from "./types.js";

/**
 * Backwards-compatible factory. Returns a configured `PaladinActionProvider`.
 *
 * @example Preview mode (free)
 * ```ts
 * import { AgentKit } from "@coinbase/agentkit";
 * import { paladinTrustActionProvider } from "@paladinfi/agentkit-actions";
 *
 * const agentkit = await AgentKit.from({
 *   walletProvider,
 *   actionProviders: [paladinTrustActionProvider()], // mode: "preview" by default
 * });
 * ```
 *
 * @example Paid mode ($0.001 USDC/call on Base)
 * ```ts
 * const agentkit = await AgentKit.from({
 *   walletProvider, // an EvmWalletProvider on Base mainnet
 *   actionProviders: [paladinTrustActionProvider({ mode: "paid" })],
 * });
 * ```
 *
 * @throws if `walletClientAccount` is in opts (legacy v0.0.x wiring; see
 *   Migration in README — paid mode now uses the AgentKit wallet provider's
 *   signer automatically via `walletProvider.toSigner()`).
 */
export function paladinTrustActionProvider(
  opts: Partial<PaladinTrustConfig> = {},
): PaladinActionProvider {
  return new PaladinActionProvider(opts);
}

// Note: NO default export. AgentKit in-tree convention is named-export only
// (compound, x402, morpho, sushi all named-export their factories). Maintainer
// review v2 L-6 flagged the default export as off-convention.
