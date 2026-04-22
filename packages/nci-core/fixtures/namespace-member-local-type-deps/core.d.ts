declare namespace core {
  interface Router {
    handle(path: string): void;
  }
}

export = core;
