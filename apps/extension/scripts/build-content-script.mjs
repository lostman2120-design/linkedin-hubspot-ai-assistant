/* global process */
import { build } from "esbuild";

await build({
  entryPoints: ["src/contentScript.tsx"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome114"],
  outfile: "dist/assets/contentScript.js",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": "\"production\"",
    __PROFILE_EXTRACTION_DEBUG__: process.env.VITE_PROFILE_EXTRACTION_DEBUG === "true" ? "true" : "false"
  },
  logLevel: "info"
});
