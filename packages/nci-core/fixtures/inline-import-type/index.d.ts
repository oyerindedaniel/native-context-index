export type VisitorKeys = import("./visitor-keys.js").VisitorKeys;
export type OtherKey = import("./other.js").OtherKey;
export type NoQualifier = import("./none.js");

/** Members expand into the remote file; definedIn must match dependency .d.ts (TS + Rust parity). */
export type ExpandedViaImport = import("./inline-import-type-remote-target.js").RemoteInner;
