export interface ContextABase {
  readonly source: "context-a";
}

declare module "./Context.js" {
  interface TagFromA {
    readonly tagA: true;
  }
}
