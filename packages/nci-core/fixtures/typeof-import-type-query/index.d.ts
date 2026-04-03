/**
 * Edge case: non-exported `declare namespace` in an external module (undici-style)
 * with `var` members typed as `typeof import("./dep").Name` — must merge nested type
 * refs into the namespace dependencies like TS `extractTypeReferences` on the subtree.
 */
declare namespace NS {
  var box: typeof import("./dep").RemoteCls;
}

/** Same `typeof import()` pattern as a package export (complements `NS.box`). */
export declare const box: typeof import("./dep").RemoteCls;

export {};
