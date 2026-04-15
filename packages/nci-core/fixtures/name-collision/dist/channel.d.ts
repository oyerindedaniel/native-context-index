export interface ChannelConfig {
  maxRetries: number;
}

/** Same short name as in stream.d.ts, different shape — separate graph rows. */
export interface DupShape {
  channelSide: boolean;
}

/**
 * Channel identity — passes through unchanged.
 */
export declare const identity: <A>(channel: ChannelConfig) => ChannelConfig;
