export declare class Dispatcher {
  close(): void;
}

export declare namespace Dispatcher {
  interface Options {
    retries: number;
  }
}

export interface UsesPlain {
  current: Dispatcher;
}

export interface UsesArray {
  items: Dispatcher[];
}

export interface UsesGeneric {
  sequence: Array<Dispatcher>;
}

export interface UsesQualified {
  options: Dispatcher.Options;
}
