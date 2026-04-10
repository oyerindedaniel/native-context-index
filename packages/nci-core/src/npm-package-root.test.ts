import { describe, it, expect } from "vitest";
import { npmPackageRoot } from "./npm-package-root.js";

describe("npmPackageRoot", () => {
  it("normalizes unscoped names, subpaths, and casing", () => {
    expect(npmPackageRoot("zod")).toBe("zod");
    expect(npmPackageRoot("zod/v4")).toBe("zod");
    expect(npmPackageRoot("Lodash")).toBe("lodash");
  });

  it("normalizes scoped packages and scoped subpaths", () => {
    expect(npmPackageRoot("@Foo/Bar")).toBe("@foo/bar");
    expect(npmPackageRoot("@SCOPE/pkg/subpath")).toBe("@scope/pkg");
  });

  it("returns null for relative, absolute, node:, URLs with slash after colon, and drive paths", () => {
    expect(npmPackageRoot("./x")).toBeNull();
    expect(npmPackageRoot("../y")).toBeNull();
    expect(npmPackageRoot("/abs")).toBeNull();
    expect(npmPackageRoot("node:fs")).toBeNull();
    expect(npmPackageRoot("C:\\x")).toBeNull();
    expect(npmPackageRoot("D:/y")).toBeNull();
    expect(npmPackageRoot("file:///tmp/x")).toBeNull();
  });

  it("treats https:// like other scheme: tokens before the first slash", () => {
    expect(npmPackageRoot("https://a/b")).toBe("https:");
  });
});
