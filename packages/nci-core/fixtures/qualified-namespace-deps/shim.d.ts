/** Local shim: same-package `import * as` namespace. */
export interface InvokeOutputOptions {
  readonly opt?: boolean;
}

export interface Output<T> {
  readonly value: T;
}
