export = app;

declare function app(): app.AppInstance;

declare namespace app {
  interface AppInstance {
    get(path: string): void;
  }

  const json: () => string;
}
