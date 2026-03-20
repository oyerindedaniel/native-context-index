/**
 * @public
 * @since 1.0.0
 */
export interface PublicAPI {
  version: string;
}

/** @internal */
export declare function _internalHelper(): void;

/** @alpha */
export interface AlphaFeature {
  experimental: boolean;
}

/**
 * @beta
 * @since 2.1.0
 */
export declare function betaFunction(): string;

/** No visibility tag */
export declare const DEFAULT_VALUE: number;
