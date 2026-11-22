// Backend lint: ESLint recommended + typescript-eslint recommended (syntax
// rules only; type-aware rules are left to `tsc --noEmit`, which `pnpm lint`
// also runs). Rules that the existing code trips widely are warnings, so lint
// fails only on new, clear-cut problems.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "src/generated/**", "storage/**", "storage-*/**", "backups/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,mts,js,mjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "prefer-const": "warn",
      "no-useless-escape": "warn",
      "no-control-regex": "warn",
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-async-promise-executor": "warn",
      "no-useless-catch": "warn",
      "no-case-declarations": "warn",
      "no-irregular-whitespace": "warn",
      "no-misleading-character-class": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
  {
    // Test files: fixtures build partial objects on purpose.
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
