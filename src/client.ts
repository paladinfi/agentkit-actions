/**
 * Thin HTTP client for the PaladinFi trust-check endpoints.
 *
 * Currently only the preview endpoint (free; sample fixture) is wired in v0.0.1.
 * Paid endpoint requires AgentKit's wallet-provider integration to perform x402
 * settlement, which lands in v0.1.0. Until then, paid mode throws.
 *
 * Note: this client is duplicated from `@paladinfi/eliza-plugin-trust` v0.0.1.
 * v0.1.0 will refactor both packages to share `@paladinfi/trust-client`.
 */

import {
  type PaladinTrustConfig,
  type TrustCheckRequest,
  type TrustCheckResponse,
  trustCheckResponseSchema,
} from "./types.js";

export class PaladinTrustClient {
  constructor(private readonly config: PaladinTrustConfig) {}

  /**
   * Hit POST /v1/trust-check/preview. Free, no auth, no payment.
   * Always returns a sample fixture — every factor has `real: false` and
   * `recommendation` is `sample-` prefixed so the response cannot be
   * cropped into looking like a real assessment.
   */
  async preview(req: TrustCheckRequest): Promise<TrustCheckResponse> {
    const url = `${this.config.apiBase}/v1/trust-check/preview`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(
        `paladin-trust preview HTTP ${res.status}: ${body.slice(0, 500)}`,
      );
    }

    const json: unknown = await res.json();
    return trustCheckResponseSchema.parse(json);
  }

  /**
   * Live paid call against /v1/trust-check. NOT IMPLEMENTED in v0.0.1.
   *
   * v0.1.0 will integrate with AgentKit's `x402ActionProvider` to handle
   * the 402 challenge → EIP-3009 USDC settlement → retry flow. Until then,
   * use {@link preview}.
   */
  async paid(_req: TrustCheckRequest): Promise<TrustCheckResponse> {
    throw new Error(
      "paladin-trust paid mode not yet implemented in v0.0.1; use preview mode. " +
        "v0.1.0 will integrate with AgentKit's x402ActionProvider for paid settlement. " +
        "Tracking: https://github.com/paladinfi/agentkit-actions/issues",
    );
  }
}
