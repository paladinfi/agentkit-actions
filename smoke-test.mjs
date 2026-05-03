// Smoke test: verify package imports + client hits live API.
// Not a full AgentKit runtime test (that requires a wallet provider). Just
// confirms the public surface works and the underlying client call succeeds.
//
// Run: node smoke-test.mjs

import {
  PaladinTrustClient,
  paladinTrustActionProvider,
  trustCheckRequestSchema,
} from "./dist/index.js";

const failures = [];
const ok = (label) => console.log(`  ✓ ${label}`);
const fail = (label, err) => {
  console.error(`  ✗ ${label}: ${err}`);
  failures.push(label);
};

try {
  // 1. package exports resolve
  if (typeof PaladinTrustClient !== "function") {
    fail("PaladinTrustClient export", "not a function/class");
  } else ok("PaladinTrustClient exported");

  if (typeof paladinTrustActionProvider !== "function") {
    fail("paladinTrustActionProvider export", "not a function");
  } else ok("paladinTrustActionProvider exported");

  if (!trustCheckRequestSchema || typeof trustCheckRequestSchema.parse !== "function") {
    fail("trustCheckRequestSchema export", "not a Zod schema");
  } else ok("trustCheckRequestSchema exported");

  // 2. factory returns a value (we don't probe AgentKit's internals; just confirm
  //    the call doesn't throw and yields a non-null object that looks provider-shaped)
  let provider;
  try {
    provider = paladinTrustActionProvider();
    if (!provider || typeof provider !== "object") {
      fail("paladinTrustActionProvider() returns object", "got " + typeof provider);
    } else if (!provider.name) {
      fail("provider.name", "missing");
    } else if (typeof provider.getActions !== "function") {
      fail("provider.getActions", "not a function");
    } else if (typeof provider.supportsNetwork !== "function") {
      fail("provider.supportsNetwork", "not a function");
    } else {
      ok(`paladinTrustActionProvider() → ActionProvider (name="${provider.name}")`);
    }
  } catch (e) {
    fail("paladinTrustActionProvider() throws", e.message);
  }

  // 3. underlying client works against live API
  const client = new PaladinTrustClient({
    apiBase: "https://swap.paladinfi.com",
    mode: "preview",
    defaultChainId: 8453,
  });
  const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const r = await client.preview({ address: usdc, chainId: 8453 });
  if (!r?.trust?.recommendation?.startsWith("sample-")) {
    fail("preview response shape", "unexpected: " + JSON.stringify(r).slice(0, 200));
  } else if (!Array.isArray(r.trust.factors) || r.trust.factors.length < 4) {
    fail("preview response factors", "unexpected: " + r.trust.factors?.length);
  } else if (r.trust._preview !== true) {
    fail("preview response _preview flag", "got: " + r.trust._preview);
  } else {
    ok(
      `live preview API: recommendation=${r.trust.recommendation}, ${r.trust.factors.length} factors, _preview=${r.trust._preview}`,
    );
  }

  // 4. schema validates good input
  const parsed = trustCheckRequestSchema.parse({ address: usdc, chainId: 8453 });
  if (parsed.address !== usdc) {
    fail("schema parse round-trip", "address mismatch");
  } else {
    ok("trustCheckRequestSchema validates valid input");
  }

  // 5. schema rejects bad input
  try {
    trustCheckRequestSchema.parse({ address: "not-an-address", chainId: 8453 });
    fail("schema rejects bad address", "did not throw");
  } catch {
    ok("trustCheckRequestSchema rejects invalid address");
  }

  if (failures.length === 0) {
    console.log(`\n✓ all checks passed (${failures.length} failures)`);
    process.exit(0);
  } else {
    console.error(`\n✗ ${failures.length} check(s) failed`);
    process.exit(1);
  }
} catch (e) {
  console.error("✗ smoke test crashed:", e.message);
  process.exit(2);
}
