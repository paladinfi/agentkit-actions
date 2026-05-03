/**
 * Wire-format types for PaladinFi /v1/trust-check responses.
 *
 * Mirrors the live API at https://swap.paladinfi.com. The preview endpoint
 * (POST /v1/trust-check/preview) returns a sample fixture with `_preview: true`
 * and per-factor `real: false`. The paid endpoint (POST /v1/trust-check) returns
 * the same shape with `real: true` on each factor — runs live OFAC SDN screening,
 * GoPlus token security, Etherscan source verification, and anomaly heuristics.
 *
 * Note: this file is duplicated from `@paladinfi/eliza-plugin-trust` v0.0.1.
 * v0.1.0 will refactor both packages to depend on a shared `@paladinfi/trust-client`.
 */

import { isAddress, type Address } from "viem";
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
  real: z.boolean(),
});
export type TrustFactor = z.infer<typeof trustFactorSchema>;

export const trustBlockSchema = z.object({
  recommendation: z.string(),
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
  request_id: z.string(),
  trust: trustBlockSchema,
});
export type TrustCheckResponse = z.infer<typeof trustCheckResponseSchema>;

export const trustCheckRequestSchema = z.object({
  address: z
    .string()
    .refine((v) => isAddress(v as Address), {
      message: "address must be a valid EIP-55 hex address",
    })
    .describe(
      "EIP-55 hex address of the buy-token contract to verify. Required.",
    ),
  chainId: z
    .number()
    .int()
    .positive()
    .default(8453)
    .describe(
      "EIP-155 chain id. Defaults to Base (8453). PaladinFi v1 supports Base only; other EVMs return HTTP 400.",
    ),
  taker: z
    .string()
    .refine((v) => isAddress(v as Address), {
      message: "taker must be a valid EIP-55 hex address",
    })
    .optional()
    .describe(
      "Optional EIP-55 hex address of the agent's wallet. Improves anomaly heuristics by checking taker→contract relationship signals.",
    ),
});
export type TrustCheckRequest = z.infer<typeof trustCheckRequestSchema>;

/**
 * Plugin-level config shape.
 */
export interface PaladinTrustConfig {
  apiBase: string;
  mode: "preview" | "paid";
  defaultChainId: number;
}

export const DEFAULT_CONFIG: PaladinTrustConfig = {
  apiBase: "https://swap.paladinfi.com",
  mode: "preview",
  defaultChainId: 8453,
};
