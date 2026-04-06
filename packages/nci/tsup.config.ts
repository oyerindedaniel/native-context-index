import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin/nci.ts"],
  format: ["cjs"],
  outDir: "dist/bin",
  clean: true,
  target: "node18",
  outExtension: () => ({ js: ".js" }),
  platform: "node",
});
