import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Flat config does not read .gitignore, so build output has to be listed
    // here explicitly — otherwise `eslint .` lints compiled Vercel bundles.
    ignores: [
      "node_modules/**",
      ".next/**",
      ".vercel/**",
      "coverage/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // Demoted so `yarn lint` can gate pushes today. These are pre-existing
    // debt (595 `any`, 30 `require()`), overwhelmingly in test files, and
    // clearing them is its own PR rather than something to fold into the
    // public-API branch. They stay visible as warnings until then.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
];

export default eslintConfig;
