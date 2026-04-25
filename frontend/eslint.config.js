import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/", "src/__tests__/", "src/test-utils.tsx"] },

  // Type-aware TypeScript rules
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React hooks — only the two classic rules (skip React Compiler rules)
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Project-specific overrides
  {
    rules: {
      // High-value for agentic coding — catch floating/misused promises
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Lean project: allow non-null assertions and console
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",

      // Flag `any` usage but don't block CI
      "@typescript-eslint/no-explicit-any": "warn",

      // tsconfig strict already enforces noUnusedLocals/noUnusedParameters
      "@typescript-eslint/no-unused-vars": "off",

      // Reduce clutter — all auto-fixable
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "prefer-template": "error",
      "no-useless-rename": "error",
    },
  },
);
