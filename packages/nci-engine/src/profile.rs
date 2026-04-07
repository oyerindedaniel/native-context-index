//! Optional stderr phase profiling. Build with `phase-profile`; logs when `NCI_PROFILE=1`.
//! Without the feature the public API is stubbed out. With it, `NCI_PROFILE` is read once per process (`OnceLock`).

#[cfg(feature = "phase-profile")]
use std::io::Write;
#[cfg(feature = "phase-profile")]
use std::sync::OnceLock;

#[cfg(feature = "phase-profile")]
const NCI_PROFILE: &str = "NCI_PROFILE";

#[cfg(feature = "phase-profile")]
fn phases_enabled_impl() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var(NCI_PROFILE)
            .map(|value| value == "1")
            .unwrap_or(false)
    })
}

/// Returns whether phase timing and stats should be printed (stderr).
#[cfg(feature = "phase-profile")]
pub fn phases_enabled() -> bool {
    phases_enabled_impl()
}

#[cfg(not(feature = "phase-profile"))]
pub fn phases_enabled() -> bool {
    false
}

/// Prints one phase line: fixed-width label (left-aligned, 24 columns) and duration in milliseconds.
#[cfg(feature = "phase-profile")]
pub fn profile_log(label: &str, ms: f64) {
    if !phases_enabled_impl() {
        return;
    }
    let mut stderr = std::io::stderr().lock();
    let _ = writeln!(stderr, "  [profile] {:<24} {:.1}ms", label, ms);
}

#[cfg(not(feature = "phase-profile"))]
#[inline]
pub fn profile_log(_label: &str, _ms: f64) {}

/// Prints one line with a string or numeric statistic under the same label column rules as [`profile_log`].
#[cfg(feature = "phase-profile")]
pub fn profile_stat(label: &str, value: impl std::fmt::Display) {
    if !phases_enabled_impl() {
        return;
    }
    let mut stderr = std::io::stderr().lock();
    let _ = writeln!(stderr, "  [profile] {:<24} {}", label, value);
}

#[cfg(not(feature = "phase-profile"))]
#[inline]
pub fn profile_stat(_label: &str, _value: impl std::fmt::Display) {}
