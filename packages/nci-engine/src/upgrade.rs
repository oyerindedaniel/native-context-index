//! Release download and install for `nci upgrade`.

use std::env;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

use flate2::read::GzDecoder;

use crate::cache::NCI_ENGINE_VERSION;

pub const DEFAULT_GITHUB_REPO: &str = "oyerindedaniel/native-context-index";
pub const NPM_PACKAGE_NAME: &str = "@nativecontextindex/cli";

const VERSION_STAMP_FILE: &str = ".nci-version";

/// Parsed semver (major.minor.patch); pre-release segments are ignored.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Semver {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SemverCompare {
    Less,
    Equal,
    Greater,
}

impl Semver {
    pub fn parse(raw: &str) -> Result<Self, String> {
        let trimmed = raw.trim().trim_start_matches('v');
        let core = trimmed.split(['-', '+']).next().unwrap_or(trimmed);
        let mut parts = core.split('.');
        let major = parts
            .next()
            .ok_or_else(|| format!("invalid version '{raw}'"))?
            .parse::<u64>()
            .map_err(|_| format!("invalid version '{raw}'"))?;
        let minor = parts
            .next()
            .unwrap_or("0")
            .parse::<u64>()
            .map_err(|_| format!("invalid version '{raw}'"))?;
        let patch = parts
            .next()
            .unwrap_or("0")
            .parse::<u64>()
            .map_err(|_| format!("invalid version '{raw}'"))?;
        Ok(Self {
            major,
            minor,
            patch,
        })
    }

    pub fn compare(self, other: Self) -> SemverCompare {
        match self.major.cmp(&other.major) {
            std::cmp::Ordering::Less => return SemverCompare::Less,
            std::cmp::Ordering::Greater => return SemverCompare::Greater,
            std::cmp::Ordering::Equal => {}
        }
        match self.minor.cmp(&other.minor) {
            std::cmp::Ordering::Less => return SemverCompare::Less,
            std::cmp::Ordering::Greater => return SemverCompare::Greater,
            std::cmp::Ordering::Equal => {}
        }
        match self.patch.cmp(&other.patch) {
            std::cmp::Ordering::Less => SemverCompare::Less,
            std::cmp::Ordering::Equal => SemverCompare::Equal,
            std::cmp::Ordering::Greater => SemverCompare::Greater,
        }
    }
}

#[derive(Debug, Clone)]
pub struct UpgradePlan {
    pub current_version: Semver,
    pub target_version: Semver,
    pub target_label: String,
}

#[derive(Debug, Clone, Default)]
pub struct UpgradeOutcome {
    pub binary_updated: bool,
    pub npm_package_updated: bool,
    pub installed_path: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct UpgradeOptions {
    pub target_version: Option<String>,
    pub check_only: bool,
    pub dry_run: bool,
    pub force_binary: bool,
}

pub fn current_engine_semver() -> Result<Semver, String> {
    Semver::parse(NCI_ENGINE_VERSION)
}

pub fn resolve_upgrade_plan(options: &UpgradeOptions) -> Result<UpgradePlan, String> {
    let current_version = current_engine_semver()?;
    let target_label = match options.target_version.as_deref() {
        Some(explicit) => explicit.trim().trim_start_matches('v').to_string(),
        None => fetch_latest_release_version()?,
    };
    let target_version = Semver::parse(&target_label)?;
    match target_version.compare(current_version) {
        SemverCompare::Less | SemverCompare::Equal => {
            return Err(format!(
                "target version v{target_label} is not newer than current v{NCI_ENGINE_VERSION} (upgrade requires a higher version)"
            ));
        }
        SemverCompare::Greater => {}
    }
    Ok(UpgradePlan {
        current_version,
        target_version,
        target_label,
    })
}

pub fn run_upgrade(options: &UpgradeOptions) -> Result<(UpgradePlan, UpgradeOutcome), String> {
    let plan = resolve_upgrade_plan(options)?;
    if options.check_only || options.dry_run {
        return Ok((plan, UpgradeOutcome::default()));
    }

    let mut outcome = UpgradeOutcome::default();
    if let Some(package_root) = find_npm_package_root_from_current_exe()
        && !options.force_binary
    {
        run_npm_global_install(&plan.target_label)?;
        outcome.npm_package_updated = true;
        let vendor_dir = package_root.join("vendor");
        let installed = install_binary_to_vendor(&vendor_dir, &plan.target_label)?;
        outcome.binary_updated = installed.updated;
        outcome.installed_path = Some(installed.path);
        return Ok((plan, outcome));
    }

    let install_target = resolve_direct_install_target()?;
    let installed = install_binary_at_path(&install_target, &plan.target_label)?;
    outcome.binary_updated = installed.updated;
    outcome.installed_path = Some(installed.path);
    Ok((plan, outcome))
}

struct InstallResult {
    updated: bool,
    path: PathBuf,
}

fn native_binary_filename() -> &'static str {
    if env::consts::OS == "windows" {
        "nci.exe"
    } else {
        "nci"
    }
}

fn github_repo_slug() -> String {
    env::var("NCI_GITHUB_REPO").unwrap_or_else(|_| DEFAULT_GITHUB_REPO.to_string())
}

fn http_agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .https_only(true)
        .build()
        .new_agent()
}

pub fn fetch_latest_release_version() -> Result<String, String> {
    let owner_repo = github_repo_slug();
    let url = format!("https://api.github.com/repos/{owner_repo}/releases/latest");
    let response = http_agent()
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "nci-upgrade")
        .call()
        .map_err(|error| format!("GitHub releases API: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub releases API returned HTTP {}",
            response.status()
        ));
    }
    let body_text = response
        .into_body()
        .read_to_string()
        .map_err(|error| format!("GitHub releases API body: {error}"))?;
    let body: serde_json::Value = serde_json::from_str(&body_text)
        .map_err(|error| format!("GitHub releases API JSON: {error}"))?;
    let tag = body
        .get("tag_name")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "GitHub releases API response missing tag_name".to_string())?;
    Ok(tag.trim().trim_start_matches('v').to_string())
}

fn platform_asset_name() -> Result<String, String> {
    let suffix = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "win32-x64",
        ("windows", "aarch64") => "win32-arm64",
        ("macos", "x86_64") => "darwin-x64",
        ("macos", "aarch64") => "darwin-arm64",
        ("linux", "x86_64") => "linux-x64",
        ("linux", "aarch64") => "linux-arm64",
        (os, arch) => {
            return Err(format!("nci upgrade: no prebuilt binary for {os}-{arch}"));
        }
    };
    if std::env::consts::OS == "windows" {
        Ok(format!("nci-{suffix}.exe.gz"))
    } else {
        Ok(format!("nci-{suffix}.gz"))
    }
}

fn release_download_url(version: &str, asset_name: &str) -> String {
    if let Ok(base) = env::var("NCI_DOWNLOAD_BASE_URL") {
        return format!("{}/v{}/{}", base.trim_end_matches('/'), version, asset_name);
    }
    let owner_repo = github_repo_slug();
    format!("https://github.com/{owner_repo}/releases/download/v{version}/{asset_name}")
}

fn download_release_bytes(version: &str) -> Result<Vec<u8>, String> {
    let asset_name = platform_asset_name()?;
    let url = release_download_url(version, &asset_name);
    let response = http_agent()
        .get(&url)
        .header("User-Agent", "nci-upgrade")
        .call()
        .map_err(|error| format!("download {url}: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("download {url}: HTTP {}", response.status()));
    }
    let compressed = response
        .into_body()
        .read_to_vec()
        .map_err(|error| format!("read download body: {error}"))?;
    let mut decoder = GzDecoder::new(compressed.as_slice());
    let mut body = Vec::new();
    decoder
        .read_to_end(&mut body)
        .map_err(|error| format!("gunzip release asset: {error}"))?;
    Ok(body)
}

fn write_version_stamp(parent_dir: &Path, version: &str) -> Result<(), String> {
    std::fs::write(parent_dir.join(VERSION_STAMP_FILE), format!("{version}\n"))
        .map_err(|error| format!("write version stamp: {error}"))
}

fn read_version_stamp(parent_dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(parent_dir.join(VERSION_STAMP_FILE)).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn install_bytes_at_path(
    dest: &Path,
    staging: &Path,
    body: &[u8],
    version: &str,
) -> Result<bool, String> {
    std::fs::write(staging, body).map_err(|error| format!("write staging binary: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(staging)
            .map_err(|error| format!("staging metadata: {error}"))?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(staging, permissions)
            .map_err(|error| format!("chmod staging binary: {error}"))?;
    }

    if read_version_stamp(dest.parent().unwrap_or(dest)) == Some(version.to_string())
        && dest.exists()
        && dest.metadata().map(|meta| meta.len()).unwrap_or(0) > 0
    {
        let _ = std::fs::remove_file(staging);
        return Ok(false);
    }

    if dest.exists() {
        let _ = std::fs::remove_file(dest);
    }
    std::fs::rename(staging, dest).map_err(|error| {
        format!(
            "replace {}: {error} (close other nci processes and retry on Windows)",
            dest.display()
        )
    })?;
    if let Some(parent) = dest.parent() {
        write_version_stamp(parent, version)?;
    }
    Ok(true)
}

fn install_binary_at_path(dest: &Path, version: &str) -> Result<InstallResult, String> {
    let body = download_release_bytes(version)?;
    let staging = dest.with_extension("new");
    let updated = install_bytes_at_path(dest, &staging, &body, version)?;
    Ok(InstallResult {
        updated,
        path: dest.to_path_buf(),
    })
}

fn install_binary_to_vendor(vendor_dir: &Path, version: &str) -> Result<InstallResult, String> {
    std::fs::create_dir_all(vendor_dir).map_err(|error| format!("create vendor dir: {error}"))?;
    let dest = vendor_dir.join(native_binary_filename());
    install_binary_at_path(&dest, version)
}

fn resolve_direct_install_target() -> Result<PathBuf, String> {
    let current_exe = env::current_exe().map_err(|error| error.to_string())?;
    let normalized = current_exe.canonicalize().unwrap_or(current_exe);
    if let Some(vendor_dir) = normalized.parent()
        && vendor_dir.ends_with("vendor")
    {
        return Ok(vendor_dir.join(native_binary_filename()));
    }
    Ok(normalized)
}

fn find_npm_package_root_from_current_exe() -> Option<PathBuf> {
    let current_exe = env::current_exe().ok()?;
    let mut cursor = current_exe.parent()?;
    for _ in 0..12 {
        let package_json = cursor.join("package.json");
        if package_json.is_file() {
            let text = std::fs::read_to_string(&package_json).ok()?;
            if text.contains(NPM_PACKAGE_NAME) {
                return Some(cursor.to_path_buf());
            }
        }
        cursor = cursor.parent()?;
    }
    None
}

fn run_npm_global_install(version: &str) -> Result<(), String> {
    let spec = format!("{NPM_PACKAGE_NAME}@{version}");
    let outcome = Command::new("npm")
        .args(["install", "-g", &spec])
        .status()
        .map_err(|error| format!("npm install -g {spec}: {error}"))?;
    if !outcome.success() {
        return Err(format!(
            "npm install -g {spec} failed with status {outcome}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_parse_and_compare() {
        let left = Semver::parse("0.1.0").unwrap();
        let right = Semver::parse("v0.2.0").unwrap();
        assert_eq!(left.compare(right), SemverCompare::Less);
        assert_eq!(right.compare(left), SemverCompare::Greater);
        assert_eq!(left.compare(left), SemverCompare::Equal);
    }

    #[test]
    fn semver_rejects_downgrade_target() {
        let current = Semver::parse("1.0.0").unwrap();
        let target = Semver::parse("0.9.9").unwrap();
        assert_eq!(target.compare(current), SemverCompare::Less);
    }

    #[test]
    fn release_url_uses_github_by_default() {
        let url = release_download_url("0.2.0", "nci-linux-x64.gz");
        assert!(url.contains(DEFAULT_GITHUB_REPO));
        assert!(url.contains("v0.2.0"));
    }
}
