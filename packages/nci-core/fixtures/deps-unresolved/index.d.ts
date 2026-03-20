// InternalHelper is NOT exported — file-local type
interface InternalHelper {
  run(): void;
}

// Base is NOT exported — file-local type
type Base = { id: string };

// Config IS exported
export interface Config {
  name: string;
}

// Service references Config (exported) AND InternalHelper + Base (not exported)
export interface Service {
  config: Config;
  helper: InternalHelper;
  base: Base;
}

// Generic function with type param T (not a real symbol)
export declare function create<T>(input: T): Service;
