use phf::phf_set;

/// Default cap on discovery edges from each package entry (`0` = entry files only).
pub const DEFAULT_MAX_HOPS: usize = 10;

/// User-facing value for “no hop cap” in CLI / `.nci.toml`. Internally mapped to [`usize::MAX`].
pub const MAX_HOPS_UNLIMITED: i64 = -1;

/// Convert merged CLI/config `max_hops` (`None` → default cap, [`MAX_HOPS_UNLIMITED`] → [`usize::MAX`]).
pub fn max_hops_from_user_value(opt: Option<i64>) -> Result<usize, String> {
    match opt.unwrap_or(DEFAULT_MAX_HOPS as i64) {
        MAX_HOPS_UNLIMITED => Ok(usize::MAX),
        hops if hops < 0 => Err(format!(
            "max-hops must be {} (unlimited) or a non-negative integer, got {hops}",
            MAX_HOPS_UNLIMITED
        )),
        hops => usize::try_from(hops).map_err(|_| format!("max-hops value {hops} does not fit usize")),
    }
}

/// The maximum recursion depth for complex type expansion (Object Spreads & Mixins).
pub const MAX_RECURSION_DEPTH: usize = 10;

/// Built-in type names that should NOT be treated as dependencies.
pub static BUILTIN_TYPES: phf::Set<&'static str> = phf_set! {
    "string", "number", "boolean", "void", "any", "unknown", "never",
    "null", "undefined", "object", "Object", "symbol", "bigint",
    "Array", "ReadonlyArray", "Promise", "Map", "Set", "WeakMap", "WeakSet",
    "ReadonlyMap", "ReadonlySet",
    "Record", "Partial", "Required", "Readonly", "Pick", "Omit",
    "Exclude", "Extract", "NonNullable", "ReturnType", "Parameters",
    "InstanceType", "ConstructorParameters", "ThisParameterType", "ThisType",
    "Awaited", "NoInfer",
    "Uppercase", "Lowercase", "Capitalize", "Uncapitalize",
    "TemplateStringsArray",
    "Iterator", "IterableIterator", "AsyncIterableIterator",
    "Generator", "AsyncGenerator",
    "Date", "RegExp", "Error", "Function",
};

/// Standard Node.js built-in modules.
pub static NODE_BUILTINS: phf::Set<&'static str> = phf_set! {
    "assert", "buffer", "child_process", "cluster", "console", "constants",
    "crypto", "dgram", "diagnostics_channel", "dns", "domain", "events",
    "fs", "http", "http2", "https", "inspector", "module", "net", "os",
    "path", "perf_hooks", "process", "punycode", "querystring", "readline",
    "repl", "stream", "string_decoder", "sys", "test", "timers", "tls",
    "trace_events", "tty", "url", "util", "v8", "vm", "worker_threads", "zlib",
};

/// Visibility tag names used in JSDoc.
pub static VISIBILITY_TAGS: phf::Set<&'static str> = phf_set! {
    "public", "internal", "alpha", "beta",
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_types_contains_primitives() {
        assert!(BUILTIN_TYPES.contains("string"));
        assert!(BUILTIN_TYPES.contains("number"));
        assert!(BUILTIN_TYPES.contains("boolean"));
        assert!(BUILTIN_TYPES.contains("void"));
        assert!(BUILTIN_TYPES.contains("any"));
        assert!(BUILTIN_TYPES.contains("unknown"));
        assert!(BUILTIN_TYPES.contains("never"));
    }

    #[test]
    fn builtin_types_contains_utility_types() {
        assert!(BUILTIN_TYPES.contains("Record"));
        assert!(BUILTIN_TYPES.contains("Partial"));
        assert!(BUILTIN_TYPES.contains("Pick"));
        assert!(BUILTIN_TYPES.contains("Omit"));
        assert!(BUILTIN_TYPES.contains("ReturnType"));
        assert!(BUILTIN_TYPES.contains("Awaited"));
    }

    #[test]
    fn builtin_types_rejects_custom_types() {
        assert!(!BUILTIN_TYPES.contains("MyCustomType"));
        assert!(!BUILTIN_TYPES.contains("EventEmitter"));
        assert!(!BUILTIN_TYPES.contains("React"));
    }

    #[test]
    fn node_builtins_contains_core_modules() {
        assert!(NODE_BUILTINS.contains("fs"));
        assert!(NODE_BUILTINS.contains("path"));
        assert!(NODE_BUILTINS.contains("events"));
        assert!(NODE_BUILTINS.contains("http"));
        assert!(NODE_BUILTINS.contains("crypto"));
        assert!(NODE_BUILTINS.contains("stream"));
        assert!(NODE_BUILTINS.contains("child_process"));
        assert!(NODE_BUILTINS.contains("worker_threads"));
    }

    #[test]
    fn node_builtins_rejects_non_builtins() {
        assert!(!NODE_BUILTINS.contains("react"));
        assert!(!NODE_BUILTINS.contains("express"));
        assert!(!NODE_BUILTINS.contains("lodash"));
    }

    #[test]
    fn visibility_tags_contains_all_levels() {
        assert!(VISIBILITY_TAGS.contains("public"));
        assert!(VISIBILITY_TAGS.contains("internal"));
        assert!(VISIBILITY_TAGS.contains("alpha"));
        assert!(VISIBILITY_TAGS.contains("beta"));
    }

    #[test]
    fn visibility_tags_rejects_non_tags() {
        assert!(!VISIBILITY_TAGS.contains("private"));
        assert!(!VISIBILITY_TAGS.contains("protected"));
        assert!(!VISIBILITY_TAGS.contains("experimental"));
    }

    #[test]
    fn recursion_caps_stay_in_sync() {
        assert_eq!(DEFAULT_MAX_HOPS, 10);
        assert_eq!(MAX_RECURSION_DEPTH, 10);
    }

    #[test]
    fn max_hops_from_user_value_unlimited() {
        assert_eq!(max_hops_from_user_value(Some(MAX_HOPS_UNLIMITED)).unwrap(), usize::MAX);
    }

    #[test]
    fn max_hops_from_user_value_default_when_none() {
        assert_eq!(
            max_hops_from_user_value(None).unwrap(),
            DEFAULT_MAX_HOPS
        );
    }

    #[test]
    fn max_hops_from_user_value_rejects_invalid_negative() {
        assert!(max_hops_from_user_value(Some(-2)).is_err());
    }
}
