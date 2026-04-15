/** Two `namespace` blocks, same name, one file — TS merges into one namespace. */
export namespace NsSameFileMerge {
  export const k = 1;
}
export namespace NsSameFileMerge {
  export interface Inner {
    n: number;
  }
}
