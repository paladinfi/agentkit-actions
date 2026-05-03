/**
 * HTTP client for the PaladinFi trust-check endpoints.
 *
 * Mirrors the security architecture of `@paladinfi/eliza-plugin-trust@0.1.0`'s
 * client: pre-sign hook with `validatePaladinContext` (6 checks against hard-coded
 * constants), HTTPS gate inside the constructor (defense in depth), `policies`
 * filter on BASE_NETWORK, scrubbed errors. No `onPaymentCreationFailure` (could
 * swallow abort + supply forged payload).
 *
 * Wallet account is held privately on the instance via `#config`. Do NOT
 * JSON.stringify the client.
 */

import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
  type PaladinTrustConfig,
  type TrustCheckApiRequest,
  type TrustCheckResponse,
  trustCheckResponseSchema,
} from "./types.js";
import { validatePaladinContext } from "./x402/validate.js";
import { scrubViemError } from "./errors.js";
import { BASE_NETWORK } from "./x402/constants.js";

const HOOK_ABORT_PREFIX = "paladin-trust BLOCKED pre-sign:";

export class PaladinTrustClient {
  readonly #config: PaladinTrustConfig;
  readonly #paidFetch: typeof globalThis.fetch | undefined;

  constructor(config: PaladinTrustConfig) {
    this.#config = config;

    if (config.mode === "paid") {
      if (!config.apiBase.startsWith("https://")) {
        throw new Error(
          `[paladin-trust] paid mode requires https:// apiBase (got "${config.apiBase.slice(0, 80)}"). ` +
            "PALADIN_TRUST_ALLOW_INSECURE has no effect on paid mode.",
        );
      }

      if (!config.walletClientAccount) {
        return;
      }

      const x402 = new x402Client();
      registerExactEvmScheme(x402, {
        signer: config.walletClientAccount,
        networks: [BASE_NETWORK],
        policies: [
          (_x402Version, reqs) => reqs.filter((r) => r.network === BASE_NETWORK),
        ],
      });
      x402.onBeforePaymentCreation(async (context) => {
        const r = validatePaladinContext(context);
        if (!r.ok) {
          return { abort: true, reason: `${HOOK_ABORT_PREFIX} ${r.reason}` };
        }
        return undefined;
      });
      this.#paidFetch = wrapFetchWithPayment(globalThis.fetch, x402);
    }
  }

  async preview(req: TrustCheckApiRequest): Promise<TrustCheckResponse> {
    const url = `${this.#config.apiBase}/v1/trust-check/preview`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
    } catch (e) {
      throw new Error(`paladin-trust preview call failed: ${scrubViemError(e)}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(
        `paladin-trust preview HTTP ${res.status}: ${body.slice(0, 500)}`,
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error(`paladin-trust preview response parse failed: ${scrubViemError(e)}`);
    }
    const parsed = trustCheckResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("paladin-trust preview response failed schema validation");
    }
    return parsed.data;
  }

  async paid(req: TrustCheckApiRequest): Promise<TrustCheckResponse> {
    if (!this.#paidFetch) {
      throw new Error(
        "paladin-trust paid mode not initialized. Construct the action provider with mode: 'paid' " +
          "and ensure your AgentKit wallet provider can produce a viem LocalAccount via toSigner().",
      );
    }
    const url = `${this.#config.apiBase}/v1/trust-check`;
    let r: Response;
    try {
      r = await this.#paidFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
    } catch (e) {
      const scrubbed = scrubViemError(e);
      const causeMsg =
        e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
      const reasonField =
        e instanceof Error && typeof (e as unknown as { reason?: unknown }).reason === "string"
          ? (e as unknown as { reason: string }).reason
          : "";
      const fromCause = causeMsg || reasonField;
      const combined = scrubbed.includes(HOOK_ABORT_PREFIX)
        ? scrubbed
        : fromCause.includes(HOOK_ABORT_PREFIX)
          ? fromCause.slice(0, 300)
          : scrubbed;
      throw new Error(`paladin-trust paid call failed: ${combined}`);
    }
    if (!r.ok) {
      throw new Error(`paladin-trust paid HTTP ${r.status}`);
    }
    let json: unknown;
    try {
      json = await r.json();
    } catch (e) {
      throw new Error(`paladin-trust paid response parse failed: ${scrubViemError(e)}`);
    }
    const parsed = trustCheckResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("paladin-trust paid response failed schema validation");
    }
    return parsed.data;
  }
}
