export interface ChannelConfig {
  maxRetries: number;
}

/**
 * Channel identity — passes through unchanged.
 */
export declare const identity: <A>(channel: ChannelConfig) => ChannelConfig;
