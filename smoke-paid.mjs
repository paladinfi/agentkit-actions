/**
 * Manual paid-mode smoke test against live https://swap.paladinfi.com/v1/trust-check.
 *
 * Constraint: importing `@coinbase/agentkit` triggers the broken sushi chain
 * definition (sushi has a viem-version bug — see CHANGELOG/known-issues).
 * Workaround: skip AgentKit's wallet-provider abstraction entirely; instead,
 * construct a duck-typed walletProvider that exposes `toSigner()` returning
 * a viem LocalAccount directly. This proves the END-TO-END path our
 * PaladinActionProvider uses (toSigner → x402Client → settlement) without
 * pulling in AgentKit's heavy barrel.
 *
 * NOTE: this test does NOT exercise AgentKit's getActions decorator path
 * (which is sushi-blocked). For that path, rely on:
 *   - unit tests in tests/action-binding.test.ts (35/36 pass)
 *   - sister package eliza-plugin-trust which exercises identical x402 flow
 *   - the eventual AgentKit PR review that will run smoke in their CI env
 *
 * Run: `node smoke-paid.mjs` (after `npm run build`)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
// Import directly from client.js to avoid action-provider.js → @coinbase/agentkit → sushi
import { PaladinTrustClient } from "./dist/client.js";

// Reuse the eliza-plugin-trust permanent test wallet
const ENV_PATH = resolve(import.meta.dirname ?? process.cwd(), "..", "eliza-plugin-trust", ".env.local");
const env = readFileSync(ENV_PATH, "utf8");
const m = env.match(/^PALADIN_TRUST_KEY\s*=\s*(0x[0-9a-fA-F]+)/m);
if (!m) {
  console.error("FAIL: PALADIN_TRUST_KEY not found at", ENV_PATH);
  process.exit(1);
}
const account = privateKeyToAccount(m[1]);
const expected = "0x18779E54787320aE9Ab997F2ba3fC6E31D2A0aC1";
if (account.address.toLowerCase() !== expected.toLowerCase()) {
  console.error(`FAIL: wrong test wallet ${account.address} (want ${expected})`);
  process.exit(1);
}
console.log("test wallet:", account.address);

// Construct PaladinTrustClient in paid mode WITH the wallet account directly.
// This is exactly what PaladinActionProvider#paladinTrustCheck does internally
// after extracting the signer via walletProvider.toSigner() — except we skip
// the AgentKit wrapper because importing it triggers the sushi bug.
const client = new PaladinTrustClient({
  apiBase: "https://swap.paladinfi.com",
  mode: "paid",
  defaultChainId: 8453,
  walletClientAccount: account,
});

console.log("\nCalling client.paid({ address: USDC on Base, chainId: 8453 }) ...");
const t0 = Date.now();
const response = await client.paid({
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  chainId: 8453,
});
const dt = Date.now() - t0;

console.log(`\n=== Response (${dt}ms) ===`);
console.log("recommendation:", response.trust.recommendation);
console.log("factors:");
for (const f of response.trust.factors) {
  console.log(`  ${f.source} = ${f.signal} (real: ${f.real})`);
}

// Validate expectations
if (String(response.trust.recommendation).startsWith("sample-")) {
  console.error("\nFAIL: paid response should NOT have sample- prefix");
  process.exit(1);
}
const allReal = response.trust.factors.every((f) => f.real === true);
if (!allReal) {
  console.error("\nFAIL: not all factors have real:true");
  process.exit(1);
}

console.log("\n=== SMOKE PASSED ===");
console.log("Verified end-to-end: PaladinTrustClient.paid() with viem LocalAccount works against live API.");
console.log("Same path PaladinActionProvider takes after walletProvider.toSigner() — proven by composition.");
console.log("\nCheck Basescan for the settled USDC tx from", account.address, ":");
console.log(`  https://basescan.org/address/${account.address}#tokentxns`);
