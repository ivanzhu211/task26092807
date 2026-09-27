declare module 'node:assert/strict' {
  const assert: {
    (value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown, error?: unknown, message?: string): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
  };
  export = assert;
}

declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
}

declare const process: {
  env: Record<string, string | undefined>;
};
