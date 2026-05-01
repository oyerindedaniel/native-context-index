import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["components/benchmarks/__tests__/**/*.test.tsx"],
  },
});
