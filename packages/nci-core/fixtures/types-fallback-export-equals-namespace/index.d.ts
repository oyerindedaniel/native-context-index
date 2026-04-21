import type { ParseShape } from "runtime-no-types-alpha";
import type { TransferOptions } from "runtime-no-types-beta";

export interface QueryWrapper {
  query: ParseShape;
}

export interface SendWrapper extends TransferOptions {
  headers?: Record<string, unknown>;
}
