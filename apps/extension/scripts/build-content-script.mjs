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
    "process.env.NODE_ENV": "\"production\""
  },
  logLevel: "info"
});

