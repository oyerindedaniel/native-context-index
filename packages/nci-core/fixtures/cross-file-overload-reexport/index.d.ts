/**
 * Package entry (`types` → this file): declares one overload, imports another from a non-entry
 * file under a different local name, then re-exports it as the same public name so both
 * overloads appear on the package surface.
 */
export declare function crossFileMergedFn(value: string): void;

import { crossFileMergedFn as crossFileMergedFnFromExtra } from "./extra-overloads.js";
export { crossFileMergedFnFromExtra as crossFileMergedFn };
