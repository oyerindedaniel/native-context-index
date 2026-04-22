declare namespace core {
  interface ParamsShape {
    id: string;
  }

  interface QueryShape {
    search: string;
  }

  interface Locals {
    tenant: string;
  }

  interface Handler<
    Params = ParamsShape,
    Query = QueryShape,
    LocalsType extends Record<string, any> = Record<string, any>,
  > {
    (params: Params, query: Query): LocalsType;
  }
}

export = core;
