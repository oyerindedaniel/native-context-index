/**
 * Covers main branches of `npmPackageRoot`: registry-style ids vs specifiers we treat as non-packages.
 */
import { describe, it, expect } from "vitest";
import { npmPackageRoot } from "./npm-package-root.js";

describe("npmPackageRoot", () => {
  describe("returns a normalized root string", () => {
    describe("unscoped (first path segment, lowercased)", () => {
      it("keeps package name; strips / and \\ subpaths", () => {
        expect(npmPackageRoot("zod")).toBe("zod");
        expect(npmPackageRoot("zod/v4")).toBe("zod");
        expect(npmPackageRoot("zod\\v4")).toBe("zod");
      });

      it("lowercases ASCII letters", () => {
        expect(npmPackageRoot("Lodash")).toBe("lodash");
      });

      it("allows single-character names", () => {
        expect(npmPackageRoot("a")).toBe("a");
      });

      it("when there is no path separator, lowercases the whole token (dots, hyphens)", () => {
        expect(npmPackageRoot("lodash.merge")).toBe("lodash.merge");
        expect(npmPackageRoot("foo-bar")).toBe("foo-bar");
      });
    });

    describe("scoped (@scope/name before subpath, lowercased)", () => {
      it("lowercases scope and package; strips subpath after / or \\", () => {
        expect(npmPackageRoot("@Foo/Bar")).toBe("@foo/bar");
        expect(npmPackageRoot("@SCOPE/pkg/subpath")).toBe("@scope/pkg");
        expect(npmPackageRoot("@SCOPE/pkg\\deep")).toBe("@scope/pkg");
      });

      it("lowercases numeric-looking scope and package segments", () => {
        expect(npmPackageRoot("@123/456")).toBe("@123/456");
      });
    });

    it("trims leading and trailing whitespace, then parses", () => {
      expect(npmPackageRoot("  zod  ")).toBe("zod");
      expect(npmPackageRoot("\tzod\n")).toBe("zod");
    });
  });

  describe("returns null", () => {
    it("for empty input or only whitespace", () => {
      expect(npmPackageRoot("")).toBeNull();
      expect(npmPackageRoot("   ")).toBeNull();
      expect(npmPackageRoot("\t")).toBeNull();
    });

    it("for relative paths (. ./ ../) and root-absolute paths (/…)", () => {
      expect(npmPackageRoot("./x")).toBeNull();
      expect(npmPackageRoot("../y")).toBeNull();
      expect(npmPackageRoot("/abs")).toBeNull();
    });

    it("for node: and file: specifiers (prefix compared ASCII case-insensitively)", () => {
      expect(npmPackageRoot("node:fs")).toBeNull();
      expect(npmPackageRoot("NODE:fs")).toBeNull();
      expect(npmPackageRoot("Node:fs/promises")).toBeNull();
      expect(npmPackageRoot("file:///tmp/x")).toBeNull();
      expect(npmPackageRoot("FiLe:///tmp/x")).toBeNull();
    });

    it("when the string contains :// (treat as URI, not a package id)", () => {
      expect(npmPackageRoot("https://a/b")).toBeNull();
      expect(npmPackageRoot("http://example/pkg")).toBeNull();
      expect(npmPackageRoot("ftp://host/path")).toBeNull();
    });

    it("for Windows drive paths, drive-relative (letter:), UNC, and leading backslash", () => {
      expect(npmPackageRoot("C:\\x")).toBeNull();
      expect(npmPackageRoot("D:/y")).toBeNull();
      expect(npmPackageRoot("z:\\")).toBeNull();
      expect(npmPackageRoot("C:rel")).toBeNull();
      expect(npmPackageRoot("\\foo")).toBeNull();
      expect(npmPackageRoot("\\\\server\\share\\x")).toBeNull();
    });

    it("for x:… where the second character is colon (non-package scheme token)", () => {
      expect(npmPackageRoot("x:y")).toBeNull();
      expect(npmPackageRoot("a:thing")).toBeNull();
    });

    it("for @… strings that are not @scope/pkg", () => {
      expect(npmPackageRoot("@")).toBeNull();
      expect(npmPackageRoot("@scope")).toBeNull();
      expect(npmPackageRoot("@scope/")).toBeNull();
      expect(npmPackageRoot("@/pkg")).toBeNull();
      expect(npmPackageRoot("@scope//pkg")).toBeNull();
    });
  });
});
