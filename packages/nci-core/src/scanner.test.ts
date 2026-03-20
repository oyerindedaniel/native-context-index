import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { scanPackages } from "./scanner.js";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");
const FAKE_NODE_MODULES = path.join(FIXTURES_DIR, "fake-node-modules");
const SKIP_ARTIFACTS = path.join(FIXTURES_DIR, "skip-artifacts");

function makeTmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `nci-test-${label}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("scanPackages", () => {
  it("discovers regular packages", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);
    const names = packages.map((packageItem) => packageItem.name);

    expect(names).toContain("simple-pkg");
    expect(names).toContain("another-pkg");
  });

  it("discovers scoped packages", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);
    const names = packages.map((packageItem) => packageItem.name);

    expect(names).toContain("@myorg/core");
    expect(names).toContain("@myorg/utils");
  });

  it("marks scoped packages correctly", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);

    const scopedPkg = packages.find((packageItem) => packageItem.name === "@myorg/core");
    expect(scopedPkg).toBeDefined();
    expect(scopedPkg!.isScoped).toBe(true);

    const regularPkg = packages.find((packageItem) => packageItem.name === "simple-pkg");
    expect(regularPkg).toBeDefined();
    expect(regularPkg!.isScoped).toBe(false);
  });

  it("reads version from package.json", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);

    const pkg = packages.find((packageItem) => packageItem.name === "simple-pkg");
    expect(pkg?.version).toBe("1.0.0");

    const scoped = packages.find((packageItem) => packageItem.name === "@myorg/core");
    expect(scoped?.version).toBe("3.0.0");
  });

  it("skips .cache and other non-package directories", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);
    const names = packages.map((packageItem) => packageItem.name);

    expect(names).not.toContain(".cache");
  });

  it("skips packages with malformed package.json", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);
    const names = packages.map((pkg) => pkg.name);

    expect(names).not.toContain("broken-pkg");
  });

  it("provides absolute dir path for each package", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);

    for (const pkg of packages) {
      expect(path.isAbsolute(pkg.dir)).toBe(true);
      expect(pkg.dir).toContain("fake-node-modules");
    }
  });

  it("throws for non-existent node_modules path", () => {
    expect(() =>
      scanPackages("/nonexistent/path/node_modules")
    ).toThrow("node_modules not found");
  });

  it("skips ALL package manager artifacts (npm, pnpm, yarn, bun)", () => {
    const packages = scanPackages(SKIP_ARTIFACTS);
    const names = packages.map((packageItem) => packageItem.name);

    expect(names).toContain("real-pkg");
    expect(packages).toHaveLength(1);

    expect(names).not.toContain(".cache");
    expect(names).not.toContain(".pnpm");
    expect(names).not.toContain(".bin");
    expect(names).not.toContain(".bun");
    expect(names).not.toContain(".yarn-integrity");
  });

  it("follows pnpm symlinks in real node_modules", () => {
    const realNodeModules = path.resolve(__dirname, "../../../node_modules");

    if (!fs.existsSync(realNodeModules)) {
      console.log("Skipping: no real node_modules found");
      return;
    }

    const packages = scanPackages(realNodeModules);

    expect(packages.length).toBeGreaterThan(0);

    const typesNode = packages.find((packageItem) => packageItem.name === "@types/node");
    if (typesNode) {
      expect(typesNode.isScoped).toBe(true);
      expect(typesNode.version).toBeTruthy();
      expect(path.isAbsolute(typesNode.dir)).toBe(true);
    }
  });

  it("skips directories without package.json", () => {
    const tmpDir = makeTmpDir("no-pkg-json");
    fs.mkdirSync(path.join(tmpDir, "pkg-no-json"), { recursive: true });

    try {
      const packages = scanPackages(tmpDir);
      expect(packages).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("handles broken symlinks gracefully", () => {
    const tmpDir = makeTmpDir("broken-symlink");
    
    const target = path.join(tmpDir, "non-existent-at-all");
    const link = path.join(tmpDir, "broken-link");
    
    try {
      fs.symlinkSync(target, link, "dir");
      const packages = scanPackages(tmpDir);
      expect(packages).toHaveLength(0);
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === "EPERM") {
        console.log("Skipping symlink test: No permission to create symlinks");
      } else {
        throw error;
      }
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    }
  });

  it("skips non-directory entries in node_modules", () => {
    const tmpDir = makeTmpDir("non-dir");
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# Not a package");

    try {
      const packages = scanPackages(tmpDir);
      expect(packages).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("skips non-directory entries in scoped directories", () => {
    const tmpDir = makeTmpDir("scoped-file-skip");
    const scopeDir = path.join(tmpDir, "@myscope");
    fs.mkdirSync(scopeDir, { recursive: true });
    fs.writeFileSync(path.join(scopeDir, "not-a-package.txt"), "hello");
    
    try {
      const packages = scanPackages(tmpDir);
      const scopedPackages = packages.filter((pkg) => pkg.name.startsWith("@myscope"));
      expect(scopedPackages).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("handles package.json with missing name by falling back to directory name", () => {
    const parentDir = makeTmpDir("no-name-parent");
    const pkgDir = path.join(parentDir, "nameless-pkg");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ version: "1.0.0" }));
    
    try {
      const packages = scanPackages(parentDir);
      expect(packages.some(pkg => pkg.name === "nameless-pkg")).toBe(true);
    } finally {
      fs.rmSync(parentDir, { recursive: true });
    }
  });

  it("handles directory symlinks correctly", () => {
    if (process.platform === "win32") return;

    const tmpDir = makeTmpDir("symlink-dir");
    const targetDir = path.join(tmpDir, "target");
    const linkDir = path.join(tmpDir, "link");
    
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "package.json"), JSON.stringify({ name: "target", version: "1.0.0" }));
    
    fs.symlinkSync(targetDir, linkDir, "dir");
    
    try {
      const packages = scanPackages(tmpDir);
      expect(packages.some(pkg => pkg.name === "target")).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("skips packages with corrupt package.json (invalid JSON)", () => {
    const parentDir = makeTmpDir("corrupt-json-parent");
    const corruptDir = path.join(parentDir, "corrupt-pkg");
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(path.join(corruptDir, "package.json"), "{ invalid json");
    
    try {
      const packages = scanPackages(parentDir);
      expect(packages.find(pkg => pkg.dir === corruptDir)).toBeUndefined();
    } finally {
      fs.rmSync(parentDir, { recursive: true });
    }
  });
});
