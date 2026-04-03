/**
 * Child identifier shares a prefix with the parent namespace name (`Outer` + `OuterChild`).
 * Qualified export must be `Outer.OuterChild`, not a false skip from string prefix matching.
 */
export declare namespace Outer {
  interface OuterChild {
    field: number;
  }
}
