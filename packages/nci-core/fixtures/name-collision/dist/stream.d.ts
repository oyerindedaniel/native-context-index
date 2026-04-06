export interface StreamConfig {
  bufferSize: number;
}

/**
 * Stream identity — passes through unchanged.
 */
export declare const identity: <A>(stream: StreamConfig) => StreamConfig;
