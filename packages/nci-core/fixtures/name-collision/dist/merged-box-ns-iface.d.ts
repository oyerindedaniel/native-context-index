/** Same name: `namespace` + `interface` in one file — TS merges declaration spaces. */
export namespace MergedBox {
  export function make(): void;
}
export interface MergedBox {
  width: number;
}
