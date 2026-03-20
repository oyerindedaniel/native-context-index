export = merged;

/** A merged variable and namespace */
declare const merged: {
  /** A property as a symbol */
  version: string;
  /** A nested object */
  options: {
    verbose: boolean;
  };
};

declare namespace merged {
  /** An interface in the namespace */
  export interface Config {
    debug: boolean;
  }
}
