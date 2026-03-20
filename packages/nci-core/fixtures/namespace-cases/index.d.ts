/** UMD namespace declaration */
export as namespace MyLib;

export interface Widget {
  id: string;
}

export function createWidget(): Widget;

/** Recursive namespace with nested members */
export namespace API {
  export interface Config {
    url: string;
  }
  export function fetch(conf: Config): void;
  /** @internal */
  export const secret: string;
  const hidden: number; // Internal to namespace
}
