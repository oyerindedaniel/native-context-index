/** Parent type in the heritage chain (zod-style internal + exported pairs). */
declare interface RootParent {
  fromRoot(): void;
}

/** Interface must win for inheritance flattening even when the value export appears after it. */
export declare interface Dual extends RootParent {
  onlyOnDual: number;
}

/** Same basename as the interface; last in file mimics common .d.ts emit order. */
export declare const Dual: unknown;
