/// <reference path="./ref.d.ts" />
/// <reference path="./ambient-ref.d.ts" />
import type { ImportedShape } from "./imported";

export declare const ENTRY: 1;

/** References the overloaded `pick` method type from RefLib.Dual via qualified name (dot) access. */
export declare const usesPick: RefLib.Dual.pick;
export declare const pickType: typeof PICK_TYPE;
/** Ambient value from script-style `ambient-ref.d.ts` included above. */
export declare const usesAmbientPick: typeof AMBIENT_PICK;
export declare const usesImportedShape: ImportedShape;

declare const noExportKeyword: 2;
