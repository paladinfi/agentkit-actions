/**
 * Resolves PaladinTrustConfig from constructor opts + env vars.
 *
 * AgentKit context has no `runtime.getSetting()` equivalent (unlike Eliza),
 * so config is purely from constructor args + process.env. Mirror eliza-plugin-trust's
 * HTTPS-enforcement semantics for parity.
 */

import { DEFAULT_CONFIG, type PaladinTrustConfig } from "./types.js";

export function resolveConfig(
  opts: Partial<PaladinTrustConfig> = {},
): PaladinTrustConfig {
  const rawApiBase =
    opts.apiBase ?? process.env?.PALADIN_TRUST_API_BASE ?? DEFAULT_CONFIG.apiBase;
  const apiBase = enforceHttps(rawApiBase);

  const mode: PaladinTrustConfig["mode"] =
    opts.mode === "paid" ? "paid" :
      (process.env?.PALADIN_TRUST_MODE === "paid" ? "paid" : "preview");

  const chainIdFromOpts = opts.defaultChainId;
  const chainIdFromEnv = process.env?.PALADIN_TRUST_DEFAULT_CHAIN_ID
    ? Number.parseInt(process.env.PALADIN_TRUST_DEFAULT_CHAIN_ID, 10)
    : undefined;
  const defaultChainId =
    (chainIdFromOpts !== undefined && Number.isFinite(chainIdFromOpts) && chainIdFromOpts > 0)
      ? chainIdFromOpts
      : (chainIdFromEnv !== undefined && Number.isFinite(chainIdFromEnv) && chainIdFromEnv > 0)
        ? chainIdFromEnv
        : DEFAULT_CONFIG.defaultChainId;

  const config: PaladinTrustConfig = { apiBase, mode, defaultChainId };
  // walletClientAccount is set per-invocation by the ActionProvider, not here.
  return config;
}

function enforceHttps(url: string): string {
  if (url.startsWith("https://")) return url;
  if (
    url.startsWith("http://localhost") ||
    url.startsWith("http://127.0.0.1")
  ) {
    return url;
  }
  // Allow other http:// only when explicit env override is set (testnet/dev,
  // PREVIEW MODE ONLY — paid mode rejects non-HTTPS regardless via PaladinTrustClient).
  const allow = process.env?.PALADIN_TRUST_ALLOW_INSECURE ?? "";
  if (allow === "1" || allow.toLowerCase() === "true") return url;
  throw new Error(
    `[paladin-trust] apiBase must use https:// (got "${url.slice(0, 80)}"). ` +
      "Set PALADIN_TRUST_ALLOW_INSECURE=1 for non-HTTPS dev/testnet hosts (preview mode only).",
  );
}
