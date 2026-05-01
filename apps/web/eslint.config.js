import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    files: ["components/home/hero/**/*.tsx"],
    rules: {
      "react/no-unknown-property": "off",
    },
  },
  {
    files: ["components/ui/split-button.tsx"],
    rules: {
      "react/prop-types": "off",
    },
  },
];
