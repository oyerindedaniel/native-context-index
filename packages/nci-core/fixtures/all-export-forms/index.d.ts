// ─── Pattern 1: Direct interface export ────────────────────────
export interface Config {
  host: string;
  port: number;
}

// ─── Pattern 2: Direct type alias export ───────────────────────
export type Status = "active" | "inactive" | "pending";

// ─── Pattern 3: Direct function declaration export ─────────────
/**
 * Initialize the application.
 */
export declare function init(config: Config): void;

// ─── Pattern 4: Direct class export ───────────────────────────
export declare class Server {
  constructor(config: Config);
  listen(): Promise<void>;
  close(): void;
}

// ─── Pattern 5: Direct variable/const export ──────────────────
export declare const VERSION: string;

// ─── Pattern 6: Direct enum export ────────────────────────────
export declare enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// ─── Pattern 7: Local re-export (no source) ───────────────────
// (handled by the named exports below referencing local symbols)

// ─── Pattern 8: Named re-export from another file ─────────────
export { Handler } from "./handlers.js";

// ─── Pattern 9: Aliased re-export ─────────────────────────────
export { InternalRouter as Router } from "./internal.js";

// ─── Pattern 10: Wildcard re-export ───────────────────────────
export * from "./utils.js";

// ─── Pattern 11: Namespace re-export ──────────────────────────
export * as helpers from "./helpers.js";

// ─── Pattern 12: Type-only re-export ──────────────────────────
export type { RequestOptions } from "./options.js";

// ─── Pattern 13: Default export ───────────────────────────────
export default Server;

// ─── Pattern 15: Ambient module declaration ───────────────────
declare module "my-plugin" {
  export interface PluginOptions {
    name: string;
  }
}
