export interface QueryKey {
  value: string;
}

export interface DefaultError {
  message: string;
}

export interface InfiniteData<TData> {
  pages: TData[];
}

export interface RequestOptions<
  TData,
  TError = DefaultError,
  TResult = InfiniteData<TData>,
  TKey extends QueryKey = QueryKey,
> {
  key: TKey;
  map(data: TData): TResult;
  onError?(error: TError): void;
}

export interface RequestResult<TResult, TError> {
  data: TResult;
  error?: TError;
}

export interface Client {
  send(key: QueryKey): void;
}
