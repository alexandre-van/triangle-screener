import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
  {
    // CLAUDE.md: TypeScript strict. No `any`. No non-null assertions.
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    // PLAN.md §6: everything in the pattern engine is pure. It takes candles
    // in and returns patterns out.
    files: ["src/lib/patterns/**/*.ts"],
    ignores: [
      "src/lib/patterns/**/*.test.ts",
      "src/lib/patterns/**/__fixtures__/**",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "The pattern engine is pure — no I/O." },
        { name: "Date", message: "The pattern engine is pure — no clock." },
        {
          name: "console",
          message: "The pattern engine is pure — no logging.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "The pattern engine is pure — no randomness.",
        },
        {
          object: "Date",
          property: "now",
          message: "The pattern engine is pure — no clock.",
        },
      ],
    },
  },
]);

export default eslintConfig;
