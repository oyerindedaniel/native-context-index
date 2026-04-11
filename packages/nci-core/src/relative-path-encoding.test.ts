import { describe, it, expect } from "vitest";
import { encodeOutsidePackageRelative } from "./relative-path-encoding.js";

describe("encodeOutsidePackageRelative", () => {
  it("maps leading ../ to __up__ under __nci_external__", () => {
    expect(encodeOutsidePackageRelative("../other/x.d.ts")).toBe(
      "__nci_external__/__up__/other/x.d.ts",
    );
    expect(encodeOutsidePackageRelative("../../a/b")).toBe("__nci_external__/__up__/__up__/a/b");
  });

  it("strips leading ./ before counting ups", () => {
    expect(encodeOutsidePackageRelative("./../x")).toBe("__nci_external__/__up__/x");
  });

  it("uses __nci_external__ only when there are no parent hops", () => {
    expect(encodeOutsidePackageRelative("sub/no-ups.d.ts")).toBe("__nci_external__/sub/no-ups.d.ts");
  });

  it("normalizes backslashes", () => {
    expect(encodeOutsidePackageRelative("..\\other\\x.d.ts")).toBe(
      "__nci_external__/__up__/other/x.d.ts",
    );
  });
});
