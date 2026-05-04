import { describe, expect, it } from "vitest";
import { symbolSourceRowFromEncodedPath } from "./symbol-source-identity.js";

describe("symbolSourceRowFromEncodedPath", () => {
  it("uses indexed package for in-tree paths", () => {
    const row = symbolSourceRowFromEncodedPath("demo", "1.0.0", "src/index.ts");
    expect(row.sourcePackageName).toBe("demo");
    expect(row.sourcePackageVersion).toBe("1.0.0");
    expect(row.sourceFilePath).toBe("src/index.ts");
  });

  it("parses scoped external without folder-derived version", () => {
    const encoded =
      "__nci_external__/__up__/@pulumi+pulumi@3.159.0/node_modules/@pulumi/pulumi/output.d.ts";
    const row = symbolSourceRowFromEncodedPath("@pulumi/aws", "7.8.0", encoded);
    expect(row.sourcePackageName).toBe("@pulumi/pulumi");
    expect(row.sourcePackageVersion).toBeNull();
    expect(row.sourceFilePath).toBe("output.d.ts");
  });

  it("handles flat node_modules without a store-segment folder", () => {
    const encoded = "__nci_external__/__up__/node_modules/lodash/add.d.ts";
    const row = symbolSourceRowFromEncodedPath("app", "0.0.1", encoded);
    expect(row.sourcePackageName).toBe("lodash");
    expect(row.sourcePackageVersion).toBeNull();
    expect(row.sourceFilePath).toBe("add.d.ts");
  });
});
