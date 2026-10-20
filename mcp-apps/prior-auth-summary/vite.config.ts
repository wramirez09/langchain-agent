import path from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Builds the MCP Apps view to one self-contained HTML file: every script and
 * style inlined, no external fonts, images or requests. `scripts/buildMcpApp.mjs`
 * wraps the output as a string module under `lib/mcp/apps/generated/`.
 */
export default defineConfig({
  root: __dirname,
  plugins: [viteSingleFile()],
  resolve: { alias: { "@": path.resolve(__dirname, "../..") } },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2020",
  },
  logLevel: "warn",
});
