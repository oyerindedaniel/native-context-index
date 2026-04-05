//! Optional stderr profiling for nci-engine.
//!
//! When the environment variable `NCI_PROFILE` is set to `1`, helpers in this module emit
//! human-readable lines to **stderr**. Each line is written atomically with a locked handle so
//! concurrent phases do not interleave bytes from different writes on the same line.

use std::io::Write;

const NCI_PROFILE: &str = "NCI_PROFILE";

/// Returns whether phase timing and stats should be printed (stderr).
pub fn phases_enabled() -> bool {
    std::env::var(NCI_PROFILE)
        .map(|value| value == "1")
        .unwrap_or(false)
}

/// Prints one phase line: fixed-width label (left-aligned, 24 columns) and duration in milliseconds.
///
/// Format: two leading spaces, `[profile] `, label padded/truncated to the width used by
/// `format!`’s `{:<24}`, one space, then the float and `ms`.
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
