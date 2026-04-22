import * as core from "./core.js";

declare namespace surface {
  interface RouterOptions {
    strict: boolean;
  }

  function createRouter(options?: RouterOptions): core.Router;
}

export = surface;
