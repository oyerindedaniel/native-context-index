/** Top-level export in ref.d.ts, outside the namespace. */
export declare const PICK_TYPE: "pick";

declare const REF_STANDALONE: "ref";

declare namespace RefLib {
  export interface Dual {
    pick(): void;
    pick(n: number): void;
  }
}
