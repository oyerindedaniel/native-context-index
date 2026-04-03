//! Stable keys for crawl dedupe and overload identity (same declaration → one key; overloads differ by signature).

use crate::types::SymbolKind;

/// Normalize signature text for comparison (trim + collapse whitespace).
pub fn normalize_signature(signature: Option<&str>) -> String {
    let trimmed = signature.unwrap_or("").trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let mut normalized = String::with_capacity(trimmed.len());
    let mut after_whitespace_run = false;
    for character in trimmed.chars() {
        if character.is_whitespace() {
            after_whitespace_run = true;
        } else {
            if after_whitespace_run && !normalized.is_empty() {
                normalized.push(' ');
            }
            after_whitespace_run = false;
            normalized.push(character);
        }
    }
    normalized
}

/// One row per `file::name::syntaxKind::normalizedSignature` (kind is the same numeric code the serializer uses).
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
