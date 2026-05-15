import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "components/benchmarks/__tests__/**/*.test.tsx",
      "components/benchmarks/benchmark-vessel/__tests__/**/*.test.ts",
      "components/benchmarks/benchmark-vessel/__tests__/**/*.test.tsx",
      "components/docs/widgets/__tests__/**/*.test.ts",
    ],
  },
});
