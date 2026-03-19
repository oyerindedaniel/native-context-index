/** @public */
export interface PublicAPI {
  version: string;
}

/** @internal */
export declare function _internalHelper(): void;

/** @alpha */
export interface AlphaFeature {
  experimental: boolean;
}

/** @beta */
export declare function betaFunction(): string;

/** No visibility tag */
export declare const DEFAULT_VALUE: number;
