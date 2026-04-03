/// <reference path="./ref.d.ts" />
/// <reference path="./ambient-ref.d.ts" />
import type { ImportedShape } from "./imported-entry.d.ts";

export declare const ENTRY: 1;

/** References the overloaded `pick` method type from RefLib.Dual via qualified name (dot) access. */
export declare const usesPick: RefLib.Dual.pick;
export declare const pickType: typeof PICK_TYPE;
/** Global merged from `declare global` inside module-shaped `ref.d.ts` (triple-slash). */
export declare const usesGlobalFromRef: typeof GLOBAL_FROM_REF;
/** Ambient value from script-style `ambient-ref.d.ts` included above. */
export declare const usesAmbientPick: typeof AMBIENT_PICK;
export declare const usesImportedShape: ImportedShape;

declare const noExportKeyword: 2;
