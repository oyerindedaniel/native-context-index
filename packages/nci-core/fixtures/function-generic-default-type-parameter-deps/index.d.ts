import * as core from "./core.js";

export declare function usePagedQuery<
  TData,
  TError = core.DefaultError,
  TResult = core.InfiniteData<TData>,
  TKey extends core.QueryKey = core.QueryKey,
>(
  options: core.RequestOptions<TData, TError, TResult, TKey>,
  client?: core.Client,
): core.RequestResult<TResult, TError>;
