export type VisitorKeys = import("./visitor-keys.js").VisitorKeys;
export type OtherKey = import("./other.js").OtherKey;
export type NoQualifier = import("./none.js");

/** Expansion target for `import().Member`; member rows should point at this file. */
export type ExpandedViaImport = import("./inline-import-type-remote-target.js").RemoteInner;

/** Qualified `import()` chains (nested namespaces / interface). */
export type QualifiedImportChain = import("./chain.js").Outer.Inner.Leaf;
