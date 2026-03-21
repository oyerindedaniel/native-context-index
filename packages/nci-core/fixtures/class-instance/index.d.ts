/** @since 1.0.0 */
export declare class User {
  constructor(name: string);

  /** @since 1.1.0 */
  readonly name: string;

  /** @since 1.2.0 */
  greet(): string;

  /** @internal */
  _internalMethod(): void;

  static create(name: string): User;
}
