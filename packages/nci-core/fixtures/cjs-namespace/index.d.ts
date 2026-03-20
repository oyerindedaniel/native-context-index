declare namespace ts {
  export interface Node {
    kind: number;
  }
  export function createNode(): Node;
  export namespace server {
    export interface Project {}
  }
}

export = ts;
