export interface ContextBBase {
  readonly source: "context-b";
}

declare module "./Context.js" {
  interface TagFromB {
    readonly tagB: true;
  }
}
