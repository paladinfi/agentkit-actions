/**
 * Wire-format types for PaladinFi /v1/trust-check responses.
 *
 * Mirrors the live API at https://swap.paladinfi.com. The preview endpoint
 * (POST /v1/trust-check/preview) returns a sample fixture with `_preview: true`
 * and per-factor `real: false`. The paid endpoint (POST /v1/trust-check) returns
 * the same shape — runs live OFAC SDN, GoPlus, Etherscan source verification,
 * anomaly heuristics, lookalike detection.
 */

import { isAddress, type Address } from "viem";
import type { LocalAccount } from "viem/accounts";
import { z } from "zod";

export const TRUST_FACTOR_SOURCES = [
  "ofac",
  "goplus",
  "etherscan_source",
  "anomaly",
  "lookalike",
] as const;
export type TrustFactorSource = (typeof TRUST_FACTOR_SOURCES)[number];

export const TRUST_RECOMMENDATIONS = [
  "allow",
  "warn",
  "block",
  "sample-allow",
  "sample-warn",
  "sample-block",
] as const;
export type TrustRecommendation = (typeof TRUST_RECOMMENDATIONS)[number];

export const trustFactorSchema = z.object({
  source: z.string(),
  signal: z.string(),
  details: z.string().optional(),
  // `real` is present on preview responses (always false), absent on paid
  // (implicit true). Default true so action-handler `f.real ? "" : " (sample)"`
  // renders correctly in both modes.
  real: z.boolean().default(true),
});
export type TrustFactor = z.infer<typeof trustFactorSchema>;

export const trustBlockSchema = z.object({
  recommendation: z.enum(TRUST_RECOMMENDATIONS),
  recommendation_enum: z.array(z.string()).optional(),
  factors: z.array(trustFactorSchema),
  risk_score: z.number().nullable().optional(),
  risk_score_scale: z.string().optional(),
  version: z.string().optional(),
  _preview: z.boolean().optional(),
  _request_id: z.string().optional(),
  _message: z.string().optional(),
});
export type TrustBlock = z.infer<typeof trustBlockSchema>;

export const trustCheckResponseSchema = z.object({
  address: z.string(),
  chainId: z.number(),
  taker: z.string().nullable().optional(),
  // request_id is present on preview, absent on paid (verified empirically
  // 2026-05-04). Made optional.
  request_id: z.string().optional(),
  trust: trustBlockSchema,
});
export type TrustCheckResponse = z.infer<typeof trustCheckResponseSchema>;

/**
 * Schema for the `paladin_trust_check` action input. Per Maintainer review v1
 * MED-2 (Base-only provider; redundant chainId invites LLM hallucination).
 *
 * `chainId` is dropped from the public schema; the action handler injects
 * `chainId: 8453` before calling the API. PaladinFi v1 supports Base only.
 */
export const trustCheckRequestSchema = z.object({
  address: z
    .string()
    .refine((v) => isAddress(v as Address, { strict: false }), {
      message: "address must be a valid EVM hex address",
    })
    .describe("EVM hex address of the buy-token contract to verify. Required."),
  taker: z
    .string()
    .refine((v) => isAddress(v as Address, { strict: false }), {
      message: "taker must be a valid EVM hex address",
    })
    .optional()
    .describe(
      "Optional EVM hex address of the agent's wallet. Improves anomaly heuristics by checking taker↔contract relationship signals.",
    ),
});
export type TrustCheckRequest = z.infer<typeof trustCheckRequestSchema>;

/**
 * Internal request shape that goes to the API (with chainId injected).
 * Not part of the public action schema.
 */
export interface TrustCheckApiRequest {
  address: string;
  chainId: number;
  taker?: string;
}

/**
 * Plugin-level config shape. `walletClientAccount` is set internally by the
 * ActionProvider per-invocation (from `walletProvider.toSigner()`); end-users
 * MUST NOT pass it via the factory — paladinTrustActionProvider() throws if
 * `walletClientAccount` is in opts (signals legacy v0.0.x wiring).
 */
export interface PaladinTrustConfig {
  apiBase: string;
  mode: "preview" | "paid";
  defaultChainId: number;
  /** Set internally by the ActionProvider; not for end-users. */
  walletClientAccount?: LocalAccount;
}

export const DEFAULT_CONFIG: PaladinTrustConfig = {
  apiBase: "https://swap.paladinfi.com",
  mode: "preview",
  defaultChainId: 8453,
};
