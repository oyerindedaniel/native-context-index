import * as core from "./core.js";

export interface RouterOptions {
  strict: boolean;
}

export declare function createRouter(options?: RouterOptions): core.Router;
