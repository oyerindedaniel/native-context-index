/** @since 1.0.0 */
export interface Iterable {
  /** @since 1.1.0 */
  [Symbol.iterator](): void;
}

/** @since 2.0.0 */
export class Tagged {
  /** @since 2.1.0 */
  [Symbol.toStringTag]: string;
}

/** @since 3.0.0 */
export const Literals: {
  /** @since 3.1.0 */
  ["literal-key"]: number;
};

export class Overloaded {
  /** @since 1.0.0 */
  [Symbol.iterator](): void;
  /** @since 1.1.0 */
  [Symbol.iterator](arg: number): void;
}
