export interface ParamsShape {
  id: string;
}

export interface QueryShape {
  filter: string;
}

export type RequestHandler<
  Params = ParamsShape,
  Query = QueryShape,
> = (params: Params) => Query;
