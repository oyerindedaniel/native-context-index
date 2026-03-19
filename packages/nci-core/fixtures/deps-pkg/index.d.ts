export interface Config {
  name: string;
  debug: boolean;
}

export interface Logger {
  config: Config;
  level: LogLevel;
}

export type LogLevel = "info" | "warn" | "error";

export declare function createLogger(config: Config): Logger;
