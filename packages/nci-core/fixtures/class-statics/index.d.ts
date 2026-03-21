/**
 * @since 1.0.0
 * @public
 */
export class Cache {
  /**
   * @since 1.1.0
   * @public
   */
  static maxSize: number;

  /**
   * @since 1.0.0
   * @public
   */
  static clear(): void;

  /**
   * @since 1.2.0
   * @internal
   */
  static _internalHelper(): boolean;

  /**
   * Non-static member (should NOT be extracted as a separate symbol)
   */
  get(key: string): any;
}

export namespace Cache {
  export interface Options {
    ttl: number;
  }
}
