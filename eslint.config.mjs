// eslint.config.mjs
import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
    // Pull in Next’s opinionated config
    ...compat.extends("next/core-web-vitals", "next/typescript"),

    {
        plugins: {
            // extra plugins if you want, e.g. "@typescript-eslint": tsPlugin
        },
        rules: {
            // your overrides
            // "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
        }
    }
];
