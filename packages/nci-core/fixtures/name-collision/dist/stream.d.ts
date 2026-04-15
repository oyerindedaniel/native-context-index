export interface StreamConfig {
  bufferSize: number;
}

/** Same short name as in channel.d.ts, different shape — separate graph rows. */
export interface DupShape {
  streamSide: boolean;
}

/**
 * Stream identity — passes through unchanged.
 */
export declare const identity: <A>(stream: StreamConfig) => StreamConfig;
