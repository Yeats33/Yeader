declare module "node:assert/strict" {
  type AssertionError = Error;

  export function equal<T>(actual: T, expected: T, message?: string): void;
  export function match(actual: string, expected: RegExp, message?: string): void;

  const assert: {
    equal: typeof equal;
    match: typeof match;
    AssertionError: typeof Error;
  };

  export default assert;
}

declare module "node:test" {
  type TestContext = {
    name?: string;
  };

  type TestFn = (context: TestContext) => void | Promise<void>;

  export default function test(name: string, fn: TestFn): void;
}
