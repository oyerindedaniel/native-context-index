import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outDir: "dist",
  clean: true,
  target: "node18",
  outExtension: () => ({ js: ".js" }),
  platform: "node",
  shims: false,
});
