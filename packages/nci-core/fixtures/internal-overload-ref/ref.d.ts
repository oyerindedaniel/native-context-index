
declare const REF_STANDALONE: "ref";

/** Top-level export in ref.d.ts, outside the namespace. */
export declare const PICK_TYPE: "pick";

declare global {
  /** Module file augments global scope; entries see this without importing ref.d.ts. */
  const GLOBAL_FROM_REF: "global-via-module-ref";
}

declare namespace RefLib {
  export interface Dual {
    pick(): void;
    pick(n: number): void;
  }
}
