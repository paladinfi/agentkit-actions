/**
 * Drift detection — fails if x402/* files diverge from sister package.
 *
 * The plan commits to byte-for-byte reuse of the security-critical files
 * (constants, validate, errors) across @paladinfi/eliza-plugin-trust and
 * @paladinfi/agentkit-actions. This script enforces that contract.
 *
 * Wired into prepublishOnly so npm publish fails on divergence.
 *
 * To intentionally diverge (e.g., agentkit needs a different validation rule):
 *   1. Update eliza-plugin-trust first (it's the canonical source).
 *   2. Re-copy the file here.
 *   3. Re-run `npm run check-drift` to verify.
 *   4. Or, refactor to a shared @paladinfi/x402-trust-client package.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HERE = resolve(__dirname, "..");
const SISTER = resolve(HERE, "..", "eliza-plugin-trust");

const FILES = [
  "src/x402/constants.ts",
  "src/x402/validate.ts",
  "src/errors.ts",
];

if (!existsSync(SISTER)) {
  if (process.env.PALADIN_DRIFT_ALLOW_NO_SISTER === "1") {
    console.warn(`[check-drift] sister package not found at ${SISTER}`);
    console.warn("[check-drift] PALADIN_DRIFT_ALLOW_NO_SISTER=1 set; skipping with warn.");
    process.exit(0);
  }
  console.error(`[check-drift] FAIL: sister package not found at ${SISTER}`);
  console.error("[check-drift] To intentionally skip (e.g., CI without sister checkout): set PALADIN_DRIFT_ALLOW_NO_SISTER=1");
  console.error("[check-drift] Otherwise: clone @paladinfi/eliza-plugin-trust at ../eliza-plugin-trust and re-run.");
  process.exit(1);
}

let drift = false;
for (const rel of FILES) {
  const a = resolve(HERE, rel);
  const b = resolve(SISTER, rel);
  if (!existsSync(a)) {
    console.error(`[check-drift] FAIL: ${a} missing`);
    drift = true;
    continue;
  }
  if (!existsSync(b)) {
    console.error(`[check-drift] FAIL: sister missing ${b}`);
    drift = true;
    continue;
  }
  const ca = readFileSync(a, "utf8").replace(/\r\n/g, "\n");
  const cb = readFileSync(b, "utf8").replace(/\r\n/g, "\n");
  if (ca !== cb) {
    console.error(`[check-drift] FAIL: ${rel} differs from sister package`);
    console.error(`  this: ${a} (${ca.length} bytes)`);
    console.error(`  sister: ${b} (${cb.length} bytes)`);
    drift = true;
  } else {
    console.log(`[check-drift] OK: ${rel}`);
  }
}

if (drift) {
  console.error("");
  console.error("[check-drift] DIVERGENCE DETECTED. Either:");
  console.error("  - re-copy from sister (eliza-plugin-trust is canonical)");
  console.error("  - OR document the intentional divergence and update this script's allow-list");
  process.exit(1);
}
console.log("[check-drift] ALL CLEAN — sister parity verified");
