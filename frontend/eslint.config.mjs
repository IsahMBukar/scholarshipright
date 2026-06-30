import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Enforce explicit-any prevention in strict mode
      "@typescript-eslint/no-explicit-any": "warn",
      
      // React Hooks rules (already in next/core-web-vitals, but explicit here)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      
      // Prevent unused vars (except underscore-prefixed)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      
      // Consistent import ordering (auto-fixable via prettier plugin when added)
      // For now, just warn on messy patterns
      "no-restricted-imports": [
        "warn",
        {
          patterns: ["../**/src/*"], // prevent reaching outside the src boundary
        },
      ],
    },
  },
];

export default eslintConfig;
