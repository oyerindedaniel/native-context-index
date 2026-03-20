export namespace API {
  export interface Config {
    url: string;
  }
  export function fetch(conf: Config): void;
  /** @internal */
  export const secret: string;
  const hidden: number;
}
