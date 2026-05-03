/**
 * Test-only mock of @coinbase/agentkit. Avoids loading the full barrel which
 * pulls in `sushi` which has a viem-version incompatibility (defineEvmChain
 * receives undefined and crashes). We only need the symbols our code uses:
 *   - ActionProvider (abstract base class)
 *   - CreateAction (decorator)
 *   - EvmWalletProvider (value import for decorator metadata)
 *   - Action, Network (types)
 *
 * Used via vitest's vi.mock("@coinbase/agentkit", ...) at the top of test files
 * that import our ActionProvider class.
 */
import "reflect-metadata";

const ACTION_DECORATOR_KEY = Symbol.for("paladin-test:ACTION_DECORATOR_KEY");

export class EvmWalletProvider {
  // Stub — methods aren't called by tests; subclasses provide them.
  getAddress(): string {
    throw new Error("mock");
  }
  getNetwork(): unknown {
    throw new Error("mock");
  }
  toSigner(): unknown {
    throw new Error("mock");
  }
  signTypedData(_typedData: unknown): Promise<`0x${string}`> {
    throw new Error("mock");
  }
}

export abstract class ActionProvider<T = EvmWalletProvider> {
  readonly name: string;
  readonly actionProviders: ActionProvider<T>[];
  constructor(name: string, actionProviders: ActionProvider<T>[]) {
    this.name = name;
    this.actionProviders = actionProviders;
  }
  abstract supportsNetwork(network: unknown): boolean;
  getActions(walletProvider: T): Array<{ name: string; description: string; schema: unknown; invoke: (args: unknown) => Promise<string> }> {
    const proto = Object.getPrototypeOf(this);
    const stored = (Reflect.getMetadata(ACTION_DECORATOR_KEY, proto.constructor) ?? new Map()) as Map<string, { name: string; description: string; schema: unknown; methodName: string; walletProvider: boolean }>;
    const actions: Array<{ name: string; description: string; schema: unknown; invoke: (args: unknown) => Promise<string> }> = [];
    for (const meta of stored.values()) {
      const fn = (this as unknown as Record<string, (...a: unknown[]) => Promise<string>>)[meta.methodName].bind(this);
      const prefixed = `${this.constructor.name}_${meta.name}`;
      const invoke = meta.walletProvider
        ? (args: unknown) => fn(walletProvider as unknown, args)
        : (args: unknown) => fn(args);
      actions.push({ name: prefixed, description: meta.description, schema: meta.schema, invoke });
    }
    return actions;
  }
}

export interface Action {
  name: string;
  description: string;
  schema: unknown;
  invoke: (args: unknown) => Promise<string>;
}

export interface Network {
  protocolFamily?: string;
  networkId?: string;
  chainId?: string;
}

export function CreateAction(params: { name: string; description: string; schema: unknown }) {
  return function (target: object, propertyKey: string, _descriptor: PropertyDescriptor) {
    const ctor = target.constructor;
    const stored = (Reflect.getMetadata(ACTION_DECORATOR_KEY, ctor) ?? new Map()) as Map<string, { name: string; description: string; schema: unknown; methodName: string; walletProvider: boolean }>;
    // Detect walletProvider auto-bind by checking if first param of method is EvmWalletProvider.
    const paramTypes = (Reflect.getMetadata("design:paramtypes", target, propertyKey) ?? []) as Array<unknown>;
    const firstParam = paramTypes[0] as { prototype?: unknown } | undefined;
    const walletProvider = firstParam !== undefined && firstParam !== Object && (firstParam.prototype !== undefined);
    stored.set(`${ctor.name}_${params.name}`, {
      name: params.name,
      description: params.description,
      schema: params.schema,
      methodName: propertyKey,
      walletProvider,
    });
    Reflect.defineMetadata(ACTION_DECORATOR_KEY, stored, ctor);
    return target;
  };
}
