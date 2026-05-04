//! Derives persisted source fields for each symbol from the indexed package and the
//! package-relative storage `file_path`: owning package name, optional semver when the symbol is
//! in the indexed package, and path within that owning package. For `__nci_external__/…` paths,
//! the owning package is read from the first `node_modules/<pkg>/` segment; dependency semver is
//! not parsed from install-directory folder names.

pub(crate) struct SymbolSourceRow {
    pub source_package_name: String,
    pub source_package_version: Option<String>,
    pub source_file_path: String,
}

pub(crate) fn symbol_source_row_from_encoded_path(
    indexed_package_name: &str,
    indexed_package_version: &str,
    encoded_file_path: &str,
) -> SymbolSourceRow {
    if !encoded_file_path.starts_with("__nci_external__/") {
        return SymbolSourceRow {
            source_package_name: indexed_package_name.to_string(),
            source_package_version: Some(indexed_package_version.to_string()),
            source_file_path: encoded_file_path.to_string(),
        };
    }

    let segments: Vec<&str> = encoded_file_path.split('/').collect();
    let node_modules_position = segments
        .iter()
        .position(|segment| *segment == "node_modules");
    let Some(node_modules_position) = node_modules_position else {
        return SymbolSourceRow {
            source_package_name: indexed_package_name.to_string(),
            source_package_version: Some(indexed_package_version.to_string()),
            source_file_path: encoded_file_path.to_string(),
        };
    };

    let first_package_index = node_modules_position + 1;
    let Some(first_package_segment) = segments.get(first_package_index) else {
        return SymbolSourceRow {
            source_package_name: indexed_package_name.to_string(),
            source_package_version: Some(indexed_package_version.to_string()),
            source_file_path: encoded_file_path.to_string(),
        };
    };

    let (resolved_source_package, path_start_index) = if first_package_segment.starts_with('@') {
        let Some(second_scope_segment) = segments.get(first_package_index + 1) else {
            return SymbolSourceRow {
                source_package_name: indexed_package_name.to_string(),
                source_package_version: Some(indexed_package_version.to_string()),
                source_file_path: encoded_file_path.to_string(),
            };
        };
        (
            format!("{first_package_segment}/{second_scope_segment}"),
            first_package_index + 2,
        )
    } else {
        (
            (*first_package_segment).to_string(),
            first_package_index + 1,
        )
    };

    let relative_within_dependency = segments
        .get(path_start_index..)
        .map(|tail| tail.join("/"))
        .filter(|joined| !joined.is_empty())
        .unwrap_or_else(|| encoded_file_path.to_string());

    SymbolSourceRow {
        source_package_name: resolved_source_package,
        source_package_version: None,
        source_file_path: relative_within_dependency,
    }
}

#[cfg(test)]
mod symbol_source_identity_tests {
    use super::*;

    #[test]
    fn internal_symbol_matches_indexed_package() {
        let row = symbol_source_row_from_encoded_path("demo", "1.0.0", "src/index.ts");
        assert_eq!(row.source_package_name, "demo");
        assert_eq!(row.source_package_version.as_deref(), Some("1.0.0"));
        assert_eq!(row.source_file_path, "src/index.ts");
    }

    #[test]
    fn external_scoped_package_has_no_folder_derived_version() {
        let encoded = "__nci_external__/__up__/@pulumi+pulumi@3.159.0/node_modules/@pulumi/pulumi/output.d.ts";
        let row = symbol_source_row_from_encoded_path("@pulumi/aws", "7.8.0", encoded);
        assert_eq!(row.source_package_name, "@pulumi/pulumi");
        assert_eq!(row.source_package_version, None);
        assert_eq!(row.source_file_path, "output.d.ts");
    }

    #[test]
    fn external_flat_node_modules_layout() {
        let encoded = "__nci_external__/__up__/node_modules/lodash/add.d.ts";
        let row = symbol_source_row_from_encoded_path("app", "0.0.1", encoded);
        assert_eq!(row.source_package_name, "lodash");
        assert_eq!(row.source_package_version, None);
        assert_eq!(row.source_file_path, "add.d.ts");
    }
}
