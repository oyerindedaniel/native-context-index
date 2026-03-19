import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { scanPackages } from "./scanner.js";

const FAKE_NODE_MODULES = path.resolve(__dirname, "../fixtures/fake-node-modules");

describe("scanPackages", () => {
  it("discovers regular packages", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);
    const names = packages.map((p) => p.name);

    expect(names).toContain("simple-pkg");
    expect(names).toContain("another-pkg");
  });

  it("discovers scoped packages", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);
    const names = packages.map((p) => p.name);

    expect(names).toContain("@myorg/core");
    expect(names).toContain("@myorg/utils");
  });

  it("marks scoped packages correctly", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);

    const scopedPkg = packages.find((p) => p.name === "@myorg/core");
    expect(scopedPkg).toBeDefined();
    expect(scopedPkg!.isScoped).toBe(true);

    const regularPkg = packages.find((p) => p.name === "simple-pkg");
    expect(regularPkg).toBeDefined();
    expect(regularPkg!.isScoped).toBe(false);
  });

  it("reads version from package.json", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);

    const pkg = packages.find((p) => p.name === "simple-pkg");
    expect(pkg?.version).toBe("1.0.0");

    const scoped = packages.find((p) => p.name === "@myorg/core");
    expect(scoped?.version).toBe("3.0.0");
  });

  it("skips .cache and other non-package directories", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);
    const names = packages.map((p) => p.name);

    expect(names).not.toContain(".cache");
  });

  it("skips packages with malformed package.json", () => {
    const packages = scanPackages(FAKE_NODE_MODULES);
    const names = packages.map((p) => p.name);

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

  // ─── Package Manager Skip Entries ──────────────────────────

  it("skips ALL package manager artifacts (npm, pnpm, yarn, bun)", () => {
    // Create temp node_modules with all PM artifacts
    const tmpDir = path.join(FAKE_NODE_MODULES, "..", "__skip-test");
    const dirs: string[] = [
      // npm
      ".package-lock.json",
      ".cache",
      // pnpm
      ".pnpm",
      ".modules.yaml",
      // yarn
      ".yarn-integrity",
      ".yarn-state.yml",
      ".yarn-metadata.json",
      // bun
      ".bun",
      // common
      ".bin",
      ".DS_Store",
      // actual package
      "real-pkg",
    ];

    fs.mkdirSync(tmpDir, { recursive: true });
    for (const d of dirs) {
      const dir = path.join(tmpDir, d);
      fs.mkdirSync(dir, { recursive: true });
    }
    // Write package.json only in real-pkg
    fs.writeFileSync(
      path.join(tmpDir, "real-pkg", "package.json"),
      JSON.stringify({ name: "real-pkg", version: "1.0.0" })
    );

    try {
      const packages = scanPackages(tmpDir);
      const names = packages.map((p) => p.name);

      // Should find ONLY real-pkg
      expect(names).toContain("real-pkg");
      expect(packages).toHaveLength(1);

      // None of the PM artifacts should appear
      expect(names).not.toContain(".cache");
      expect(names).not.toContain(".pnpm");
      expect(names).not.toContain(".bin");
      expect(names).not.toContain(".bun");
      expect(names).not.toContain(".yarn-integrity");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  // ─── pnpm symlink support ──────────────────────────────────

  it("follows pnpm symlinks in real node_modules", () => {
    const realNodeModules = path.resolve(__dirname, "../../../node_modules");

    if (!fs.existsSync(realNodeModules)) {
      console.log("Skipping: no real node_modules found");
      return;
    }

    const packages = scanPackages(realNodeModules);

    // pnpm installs packages as symlinks — scanner should find them
    expect(packages.length).toBeGreaterThan(0);

    // Check that @types/node was discovered (it's a pnpm symlink)
    const typesNode = packages.find((p) => p.name === "@types/node");
    if (typesNode) {
      expect(typesNode.isScoped).toBe(true);
      expect(typesNode.version).toBeTruthy();
      expect(path.isAbsolute(typesNode.dir)).toBe(true);
    }
  });
});
