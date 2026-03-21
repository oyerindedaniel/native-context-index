/** @since 1.0.0 */
export declare const Base: {
  /** @since 1.1.0 */
  readonly base: string;
};

/** @since 2.0.0 */
export declare const Utils: typeof Base & {
  /** @since 2.1.0 */
  readonly extra: number;
};

/** @since 3.1.0 */
export declare const Deep: {
  readonly level1: {
    readonly level2: typeof Base & { readonly leaf: boolean };
  };
};
