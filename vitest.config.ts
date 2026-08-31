import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/app/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/__fixtures__/**",
        "src/types/**",
      ],
      // §11: the pattern engine is where bugs are invisible and expensive.
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
        "src/lib/patterns/**": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
