declare function readConfig(): provider.ConfigShape;

declare namespace provider {
  interface ConfigShape {
    mode: "strict";
  }
}

export = provider;
