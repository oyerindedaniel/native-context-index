/** Two `interface` blocks, same name, one file — TS merges. */
export interface DupIfaceSameFileTwice {
  alpha: number;
}
export interface DupIfaceSameFileTwice {
  beta: string;
}
