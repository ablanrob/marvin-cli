import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["dist/", "node_modules/", "coverage/", "*.config.js", "*.config.ts"],
  },

  // Base JS recommended rules
  eslint.configs.recommended,

  // TypeScript strict rules
  ...tseslint.configs.strict,

  // Project-specific TypeScript rules
  {
    files: ["src/**/*.ts", "bin/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce explicit return types on exported functions
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],

      // Discourage `any` — prefer `unknown`
      "@typescript-eslint/no-explicit-any": "warn",

      // No unused variables (allow underscore-prefixed)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Consistency
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // No non-null assertions without justification
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Prefer nullish coalescing
      "@typescript-eslint/prefer-nullish-coalescing": "warn",

      // General quality
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "prefer-template": "warn",
    },
  },

  // CLI entry points and CLI module — console.log is expected
  {
    files: ["bin/**/*.ts", "src/cli/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // Relaxed rules for test files
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-console": "off",
    },
  },

  // Disable formatting rules (handled by Prettier)
  eslintConfigPrettier,
);
