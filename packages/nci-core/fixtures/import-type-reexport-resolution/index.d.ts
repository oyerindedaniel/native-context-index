/**
 * Consumer package: exercises `import("pkg").Type` when `Type` is only re-exported from inner.d.ts.
 */
import type { OptionsFromInner } from "import-type-reexport-dep";

/** Target: import()-type should resolve to inner.d.ts, not npm:: stub. */
export declare const useThing: (
  options?: import("import-type-reexport-dep").OptionsFromInner<object>,
) => void;

/** Control: bare identifier resolves via import map to the same definition file. */
export declare function controlSameType(
  value: OptionsFromInner<object>,
): void;

/** Inline-on-entry: import() should resolve against dep index.d.ts. */
export declare const inlineEntry: import("import-type-reexport-dep").DeclaredOnEntry;
