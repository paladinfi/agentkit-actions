import { describe, expect, it, vi } from "vitest";
vi.mock("@coinbase/agentkit", async () => await import("./agentkit-mock.js"));

const { PaladinActionProvider, paladinTrustActionProvider, PaladinTrustClient } = await import("../src/index.js");

describe("PaladinActionProvider boot-time validation", () => {
  it("constructs in preview mode with no opts", () => {
    const p = new PaladinActionProvider();
    expect(p.name).toBe("paladin-trust");
  });

  it("constructs in paid mode with HTTPS apiBase", () => {
    const p = new PaladinActionProvider({ mode: "paid" });
    expect(p.name).toBe("paladin-trust");
  });

  it("throws if walletClientAccount is passed (legacy v0.0.x wiring)", () => {
    expect(() =>
      new PaladinActionProvider({
        // @ts-expect-error — intentional for the legacy-wiring test
        walletClientAccount: { address: "0xabc" },
      }),
    ).toThrow(/v0.1.0\+ uses the AgentKit wallet provider directly/);
  });

  it("throws on non-HTTPS apiBase in paid mode (via PaladinTrustClient)", () => {
    expect(() =>
      new PaladinTrustClient({
        apiBase: "http://attacker.example",
        mode: "paid",
        defaultChainId: 8453,
      }),
    ).toThrow(/paid mode requires https/);
  });

  it("allows http://localhost in preview mode", () => {
    expect(() =>
      new PaladinTrustClient({
        apiBase: "http://localhost:3000",
        mode: "preview",
        defaultChainId: 8453,
      }),
    ).not.toThrow();
  });

  it("paladinTrustActionProvider() returns a PaladinActionProvider instance", () => {
    const p = paladinTrustActionProvider();
    expect(p).toBeInstanceOf(PaladinActionProvider);
  });

  describe("supportsNetwork", () => {
    const p = new PaladinActionProvider();

    it("accepts Base mainnet", () => {
      expect(
        p.supportsNetwork({ protocolFamily: "evm", networkId: "base-mainnet", chainId: "8453" }),
      ).toBe(true);
    });

    it("rejects Base sepolia", () => {
      expect(
        p.supportsNetwork({ protocolFamily: "evm", networkId: "base-sepolia", chainId: "84532" }),
      ).toBe(false);
    });

    it("rejects Ethereum mainnet", () => {
      expect(
        p.supportsNetwork({ protocolFamily: "evm", networkId: "ethereum-mainnet", chainId: "1" }),
      ).toBe(false);
    });

    it("rejects Solana", () => {
      expect(
        p.supportsNetwork({ protocolFamily: "svm", networkId: "solana-mainnet" }),
      ).toBe(false);
    });

    it("rejects missing protocolFamily", () => {
      // @ts-expect-error — intentional for edge case
      expect(p.supportsNetwork({ networkId: "base-mainnet" })).toBe(false);
    });
  });
});
