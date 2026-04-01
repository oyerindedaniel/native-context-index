//! Stable keys for crawl dedupe and overload identity (aligned with `packages/nci-core/src/dedupe.ts`).

use crate::types::SymbolKind;

/// Normalize signature text for comparison (trim + collapse whitespace).
pub fn normalize_signature(sig: Option<&str>) -> String {
    let s = sig.unwrap_or("").trim();
    if s.is_empty() {
        return String::new();
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// `file::name::kind::normalizedSignature` — matches TS `symbolDedupeKey` (kind = TS syntax kind number).
pub fn symbol_dedupe_key(
    file: &str,
    name: &str,
    kind: SymbolKind,
    signature: Option<&str>,
) -> String {
    format!(
        "{}::{}::{}::{}",
        file,
        name,
        kind.numeric_kind(),
        normalize_signature(signature)
    )
}
