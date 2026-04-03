export {};

declare global {
  /** Global pick marker visible via triple-slash from module files. */
  const PICK_TYPE: "pick";

  interface MyGlobalType {
    id: string;
    value: number;
  }

  namespace MyNamespace {
    const VERSION: string;
  }
}
