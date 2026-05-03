/**
 * Verify the AgentKit-specific action surface: decorator metadata, getActions()
 * returns the right shape with the prefix stripped, and the action method is
 * properly bound to receive the wallet provider as auto-injected first arg.
 */
import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
vi.mock("@coinbase/agentkit", async () => await import("./agentkit-mock.js"));

const { PaladinActionProvider } = await import("../src/index.js");
type EvmWalletProvider = import("./agentkit-mock.js").EvmWalletProvider;

function mockWalletProvider(): EvmWalletProvider {
  // Minimal mock — only the methods getActions / our action invoke needs.
  return {
    getAddress: () => "0x18779E54787320aE9Ab997F2ba3fC6E31D2A0aC1",
    getNetwork: () => ({ protocolFamily: "evm", networkId: "base-mainnet", chainId: "8453" }),
    toSigner: vi.fn(() => {
      // Return a viem-shaped LocalAccount stub. Don't need to actually sign.
      return { address: "0x18779E54787320aE9Ab997F2ba3fC6E31D2A0aC1", type: "local" };
    }),
  } as unknown as EvmWalletProvider;
}

describe("PaladinActionProvider action binding", () => {
  it("getActions returns exactly one action", () => {
    const p = new PaladinActionProvider();
    const actions = p.getActions(mockWalletProvider());
    expect(actions.length).toBe(1);
  });

  it("action name is unprefixed (paladin_trust_check, not PaladinActionProvider_paladin_trust_check)", () => {
    const p = new PaladinActionProvider();
    const actions = p.getActions(mockWalletProvider());
    expect(actions[0].name).toBe("paladin_trust_check");
  });

  it("action description is set and non-empty", () => {
    const p = new PaladinActionProvider();
    const actions = p.getActions(mockWalletProvider());
    expect(actions[0].description).toBeTruthy();
    expect(actions[0].description.length).toBeGreaterThan(20);
  });

  it("action schema accepts a valid address", () => {
    const p = new PaladinActionProvider();
    const actions = p.getActions(mockWalletProvider());
    const result = actions[0].schema.safeParse({
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    });
    expect(result.success).toBe(true);
  });

  it("action schema rejects a malformed address", () => {
    const p = new PaladinActionProvider();
    const actions = p.getActions(mockWalletProvider());
    const result = actions[0].schema.safeParse({
      address: "not-an-address",
    });
    expect(result.success).toBe(false);
  });

  it("action schema accepts optional taker", () => {
    const p = new PaladinActionProvider();
    const actions = p.getActions(mockWalletProvider());
    const result = actions[0].schema.safeParse({
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      taker: "0x18779E54787320aE9Ab997F2ba3fC6E31D2A0aC1",
    });
    expect(result.success).toBe(true);
  });

  // SKIPPED: Verifying `walletProvider.toSigner` is called requires the real
  // AgentKit decorator metadata pipeline (Reflect.getMetadata("design:paramtypes")
  // resolving the imported EvmWalletProvider class). Our test mock can't fully
  // replicate that. The real behavior is exercised by `smoke-paid.mjs` (live
  // call against /v1/trust-check using a real ViemWalletProvider).
  it.skip("paid mode invocation calls walletProvider.toSigner exactly once (covered by smoke-paid.mjs instead)", async () => {
    /* see comment above */
  });

  it("preview mode invocation does NOT call walletProvider.toSigner", async () => {
    const p = new PaladinActionProvider();
    const wp = mockWalletProvider();
    const actions = p.getActions(wp);
    try {
      await actions[0].invoke({
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      });
    } catch {
      // network failure is fine
    }
    expect((wp.toSigner as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
