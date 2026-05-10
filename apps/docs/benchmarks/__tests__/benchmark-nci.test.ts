import { describe, expect, it, vi } from "vitest";
import type { PackageEntry } from "@repo/benchmark-contract/benchmark-types";
import * as benchmarkNci from "../benchmark-nci";
import * as benchmarkShell from "../benchmark-shell";

const baseEntry: PackageEntry = {
  id: "uuid",
  tier: "easy",
  registry: "npm",
  package_name: "uuid",
  package_version: "14.0.0",
  language_family: "typescript",
  declaration_source: "bundled",
  github: {
    owner: "uuidjs",
    repo: "uuid",
    default_branch: "main",
    pinned_sha: "sha",
    license: "MIT",
  },
};

const externalTypesEntry: PackageEntry = {
  ...baseEntry,
  id: "express",
  package_name: "express",
  package_version: "5.2.1",
  declaration_source: "external_types",
  types_package_name: "@types/express",
};

describe("runIndexingMetricsStage", () => {
  it("invokes nci index with --package-scope all-installed so default package_scope=[dependencies] does not drop benchmark selectors", async () => {
    const runShellCommandSpy = vi
      .spyOn(benchmarkShell, "runShellCommand")
      .mockResolvedValueOnce({
        exitCode: 0,
        output: "",
        stdout: "",
        stderr: "",
        durationMs: 12,
      });

    const result = await benchmarkNci.runIndexingMetricsStage(
      baseEntry,
      "C:/repo",
      "C:/repo/target/debug/nci.exe",
    );

    expect(runShellCommandSpy).toHaveBeenCalledTimes(1);
    const [, args] = runShellCommandSpy.mock.calls[0]!;
    expect(args).toEqual([
      "index",
      "-p",
      "uuid",
      "--package-scope",
      "all-installed",
    ]);
    expect(result.command).toContain("--package-scope all-installed");
    expect(result.success).toBe(true);
  });

  it("uses types_package_name as selector when declaration_source is external_types", async () => {
    const runShellCommandSpy = vi
      .spyOn(benchmarkShell, "runShellCommand")
      .mockResolvedValueOnce({
        exitCode: 0,
        output: "",
        stdout: "",
        stderr: "",
        durationMs: 7,
      });

    await benchmarkNci.runIndexingMetricsStage(
      externalTypesEntry,
      "C:/repo",
      "C:/repo/target/debug/nci.exe",
    );

    const [, args] = runShellCommandSpy.mock.calls[0]!;
    expect(args[2]).toBe("@types/express");
    expect(args).toContain("--package-scope");
    expect(args).toContain("all-installed");
  });

  it("propagates non-zero exit codes as success: false", async () => {
    vi.spyOn(benchmarkShell, "runShellCommand").mockResolvedValueOnce({
      exitCode: 1,
      output: "",
      stdout: "",
      stderr: "no matching package found to index",
      durationMs: 18,
    });

    const result = await benchmarkNci.runIndexingMetricsStage(
      baseEntry,
      "C:/repo",
      "C:/repo/target/debug/nci.exe",
    );

    expect(result.success).toBe(false);
  });
});
