import * as core from "./core.js";

declare namespace wrapper {
  interface Locals extends core.Locals {}

  interface Handler<
    Params = core.ParamsShape,
    Query = core.QueryShape,
    LocalsType extends Record<string, any> = Record<string, any>,
  > extends core.Handler<Params, Query, LocalsType> {}
}

export = wrapper;
