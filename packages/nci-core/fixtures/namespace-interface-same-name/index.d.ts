/**
 * Mirrors eslint `namespace Scope { interface Scope { ... } }` merge naming:
 * interface members must be qualified as `Outer.Outer.member`, not `Outer.member`.
 */
export namespace Scope {
  export interface Scope {
    block: unknown;
    type: string;
  }
}
