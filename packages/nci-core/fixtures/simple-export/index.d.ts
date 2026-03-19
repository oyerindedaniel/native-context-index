/**
 * A simple configuration interface.
 */
export interface Config {
  name: string;
  version: string;
  debug?: boolean;
}

/**
 * Initialize the application with the given config.
 */
export declare function init(config: Config): void;
