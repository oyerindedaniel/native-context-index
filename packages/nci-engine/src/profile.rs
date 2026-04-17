//! Optional stderr phase profiling. Build with `phase-profile`; logs when `NCI_PROFILE=1`.
//! Without the feature the public API is stubbed out. With it, `NCI_PROFILE` is read once per process (`OnceLock`).
//!
//! **Pipeline baseline (where to look first):** `build_package_graph` emits labels such as
//! `graph.resolve_entry`, `graph.crawl_total` (parse + crawl of `.d.ts` files), `graph.merge`,
//! `graph.ids_maps`, `graph.resolve_deps`, `graph.flatten_heritage`, and `graph.assembly_total`.
//! Compare those durations before optimizing a single subsystem; crawl often includes lexer/parser work
//! for every visited file. For deeper call stacks, use `cargo flamegraph` (or your OS profiler) on
//! the `index` / `nci` binary under realistic workloads.
//!
//! **Larger parser memory layouts** (arena-backed `ParsedExport` lists, two-pass enclosing fill):
//! only worth pursuing if profiling shows the parser or merge phase as a dominant cost; the default
//! `Vec` extraction path is simpler and already parity-tested.

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
