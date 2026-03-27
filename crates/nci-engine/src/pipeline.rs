
use std::path::Path;

use rayon::prelude::*;

use crate::crawler::CrawlOptions;
use crate::graph::build_package_graph;
use crate::scanner::{scan_packages, ScanError};
use crate::types::PackageGraph;

/// Configuration for the indexing pipeline.
#[derive(Debug, Clone)]
pub struct IndexOptions {
    /// Maximum depth for following re-exports within each package (default: 10).
    pub max_depth: usize,

    /// Whether to run in parallel (default: true).
    /// Set to false for deterministic output ordering in tests.
    pub parallel: bool,
}

impl Default for IndexOptions {
    fn default() -> Self {
        Self {
            max_depth: crate::constants::DEFAULT_MAX_DEPTH,
            parallel: true,
        }
    }
}

/// Index all packages in a `node_modules` directory.
///
/// Scans for packages, resolves types entry points, crawls `.d.ts` files,
/// and builds a symbol graph for each package.
///
/// When `parallel` is true (default), packages are processed concurrently
/// using `rayon`'s work-stealing thread pool.
///
/// # Errors
/// Returns `ScanError` if the `node_modules` directory doesn't exist or
/// cannot be read.
pub fn index_all(
    node_modules: &Path,
    options: Option<IndexOptions>,
) -> Result<Vec<PackageGraph>, ScanError> {
    let opts = options.unwrap_or_default();
    let packages = scan_packages(node_modules)?;

    let crawl_options_factory = || {
        Some(CrawlOptions {
            max_depth: opts.max_depth,
        })
    };

    let graphs: Vec<PackageGraph> = if opts.parallel {
        packages
            .par_iter()
            .map(|package| build_package_graph(package, crawl_options_factory()))
            .collect()
    } else {
        packages
            .iter()
            .map(|package| build_package_graph(package, crawl_options_factory()))
            .collect()
    };

    Ok(graphs)
}

/// Index a single package by its directory path.
///
/// Useful for targeted indexing of a specific package without scanning
/// all of `node_modules`.
///
/// # Arguments
/// * `package_dir` - Absolute path to the package directory.
/// * `name` - Package name (e.g., `"react"` or `"@types/react"`).
/// * `version` - Package version string.
/// * `options` - Optional crawl configuration.
pub fn index_single(
    package_dir: &Path,
    name: &str,
    version: &str,
    options: Option<CrawlOptions>,
) -> PackageGraph {
    let info = crate::types::PackageInfo {
        name: name.to_string(),
        version: version.to_string(),
        dir: package_dir.to_path_buf(),
        is_scoped: name.starts_with('@'),
    };

    build_package_graph(&info, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn index_all_returns_error_for_missing_dir() {
        let result = index_all(Path::new("/nonexistent/node_modules"), None);
        assert!(result.is_err());
    }

    #[test]
    fn index_all_handles_empty_node_modules() {
        let temp_dir = TempDir::new().unwrap();
        let result = index_all(temp_dir.path(), None);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn index_single_builds_graph() {
        let temp_dir = TempDir::new().unwrap();
        let pkg_dir = temp_dir.path();

        fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "test-pkg", "version": "1.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();

        fs::write(
            pkg_dir.join("index.d.ts"),
            "export declare function hello(): void;",
        )
        .unwrap();

        let graph = index_single(pkg_dir, "test-pkg", "1.0.0", None);

        assert_eq!(graph.package, "test-pkg");
        assert_eq!(graph.version, "1.0.0");
        assert!(graph.total_symbols >= 1);
        assert!(graph.symbols.iter().any(|s| s.name == "hello"));
    }

    #[test]
    fn index_all_discovers_and_indexes_packages() {
        let temp_dir = TempDir::new().unwrap();
        let nm = temp_dir.path();

        let pkg_dir = nm.join("my-lib");
        fs::create_dir_all(&pkg_dir).unwrap();
        fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "my-lib", "version": "3.0.0", "types": "./index.d.ts"}"#,
        )
        .unwrap();
        fs::write(
            pkg_dir.join("index.d.ts"),
            "export declare const VALUE: number;",
        )
        .unwrap();

        let result = index_all(
            nm,
            Some(IndexOptions {
                parallel: false,
                ..Default::default()
            }),
        );

        assert!(result.is_ok());
        let graphs = result.unwrap();
        assert_eq!(graphs.len(), 1);
        assert_eq!(graphs[0].package, "my-lib");
        assert!(graphs[0].symbols.iter().any(|s| s.name == "VALUE"));
    }
}
