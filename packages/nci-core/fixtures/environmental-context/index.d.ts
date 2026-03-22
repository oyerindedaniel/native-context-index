import { ServerResponse as ServerResponse$1 } from 'http';
import { ServerResponse } from 'node:http';
import { WriteStream } from 'fs';
import { ParsedPath } from 'path';
import { test } from 'node:test';
import { CustomType } from 'ext:custom-system';

/**
 * A handler that depends on environmental and external protocol types.
 */
export interface Handler {
  /**
   * Writes results to a Node.js ServerResponse.
   */
  handle(res: ServerResponse): void;

  /**
   * Processes data using an external custom protocol type.
   */
  process(data: CustomType): void;
  /**
   * Processes an aliased, protocol-less built-in type.
   */
  pipe(res: ServerResponse$1): void;
  /**
   * More built-in types.
   */
  save(stream: WriteStream): void;
  resolve(path: ParsedPath): void;
  run(t: typeof test): void;
}
