export declare class Base {
  /** @since 1.0.0 */
  baseMethod(): void;
}

/** @since 2.0.0 */
export declare const Mixed: typeof Base & {
  /** @since 2.1.0 */
  staticExtra(): number;
} & {
  prototype: {
    /** @since 2.2.0 */
    mixinMethod(): string;
  }
};
