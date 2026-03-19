/** @deprecated Use newInit instead */
export declare function oldInit(): void;

/** @deprecated */
export interface LegacyConfig {
  name: string;
}

/** This is the current API */
export declare function newInit(): void;

export interface ModernConfig {
  name: string;
  version: string;
}
