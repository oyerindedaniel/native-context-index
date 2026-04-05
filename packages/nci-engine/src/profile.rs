//! Optional stderr profiling for nci-engine.

use std::io::Write;

const NCI_PROFILE: &str = "NCI_PROFILE";

/// Returns whether phase timing and stats should be printed (stderr).
pub fn phases_enabled() -> bool {
    std::env::var(NCI_PROFILE)
        .map(|value| value == "1")
        .unwrap_or(false)
}

/// Prints one phase line: fixed-width label (left-aligned, 24 columns) and duration in milliseconds.
pub fn profile_log(label: &str, ms: f64) {
    if !phases_enabled() {
        return;
    }
    let mut stderr = std::io::stderr().lock();
    let _ = writeln!(stderr, "  [profile] {:<24} {:.1}ms", label, ms);
}

/// Prints one line with a string or numeric statistic under the same label column rules as [`profile_log`].
pub fn profile_stat(label: &str, value: impl std::fmt::Display) {
    if !phases_enabled() {
        return;
    }
    let mut stderr = std::io::stderr().lock();
    let _ = writeln!(stderr, "  [profile] {:<24} {}", label, value);
}
