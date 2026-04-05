//! Phase timing on stderr when `NCI_PROFILE=1`, aligned with `nci-core` `profileLog` / `profileStat`.

use std::io::Write;

const NCI_PROFILE: &str = "NCI_PROFILE";

/// True when phase-level timing should be printed to stderr (same env as TypeScript).
pub fn phases_enabled() -> bool {
    std::env::var(NCI_PROFILE)
        .map(|value| value == "1")
        .unwrap_or(false)
}

/// Log phase duration in milliseconds (label column padded like TS `padEnd(24)` minimum).
pub fn profile_log(label: &str, ms: f64) {
    if !phases_enabled() {
        return;
    }
    let _ = writeln!(std::io::stderr(), "  [profile] {:<24} {:.1}ms", label, ms);
}

/// Log a non-timing value when profiling is enabled.
pub fn profile_stat(label: &str, value: impl std::fmt::Display) {
    if !phases_enabled() {
        return;
    }
    let _ = writeln!(std::io::stderr(), "  [profile] {:<24} {}", label, value);
}
