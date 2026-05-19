#!/usr/bin/env bash
# Native Context Index installer — https://nativecontextindex.com
# 1) If npm exists: npm install -g @nativecontextindex/cli (recommended).
# 2) Else if node+curl exist: download GitHub release into ~/.local/bin via Node scripts
set -euo pipefail

NCI_GITHUB_REPO="${NCI_GITHUB_REPO:-oyerindedaniel/native-context-index}"
NCI_VERSION="${NCI_VERSION:-latest}"
NCI_PACKAGE="@nativecontextindex/cli"
NCI_INSTALL_DIR="${NCI_INSTALL_DIR:-${HOME}/.local/bin}"
NCI_SCRIPTS_REF="${NCI_SCRIPTS_REF:-main}"

install_via_npm() {
  local spec="${NCI_PACKAGE}"
  if [[ "${NCI_VERSION}" != "latest" ]]; then
    spec="${NCI_PACKAGE}@${NCI_VERSION}"
  fi
  echo "==> Installing ${spec} via npm"
  npm install -g "${spec}"
  echo "==> Done. Verify with: nci --version"
}

install_via_node_helper() {
  local temp_dir
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "${temp_dir}"' EXIT

  local scripts_base="https://raw.githubusercontent.com/${NCI_GITHUB_REPO}/${NCI_SCRIPTS_REF}/packages/nci/scripts"
  echo "==> Downloading install helper from ${NCI_GITHUB_REPO}"
  curl -fsSL "${scripts_base}/download-binary.cjs" -o "${temp_dir}/download-binary.cjs"
  curl -fsSL "${scripts_base}/install-direct.cjs" -o "${temp_dir}/install-direct.cjs"

  mkdir -p "${NCI_INSTALL_DIR}"
  export NCI_INSTALL_DIR
  export NCI_VERSION
  export NCI_GITHUB_REPO
  node "${temp_dir}/install-direct.cjs" "${NCI_VERSION}" "${NCI_INSTALL_DIR}"

  case ":${PATH}:" in
    *":${NCI_INSTALL_DIR}:"*) ;;
    *)
      echo "==> Add to PATH: export PATH=\"${NCI_INSTALL_DIR}:\$PATH\""
      ;;
  esac
  echo "==> Verify with: nci --version"
}

if command -v npm >/dev/null 2>&1; then
  install_via_npm
  exit 0
fi

if command -v node >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
  install_via_node_helper
  exit 0
fi

echo "nci install: need npm (recommended) or node+curl for a direct binary install." >&2
echo "  npm install -g ${NCI_PACKAGE}" >&2
exit 1
