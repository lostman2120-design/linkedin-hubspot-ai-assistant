import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const defaultStripePaymentLink = "https://buy.stripe.com/4gMdR94zOalH6pebny8Vi00";
const defaultApiBaseUrl = "https://linkedin-hubspot-ai-assistant.onrender.com";
const packageJson = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version?: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");

  return {
    plugins: [react()],
    define: {
      __STRIPE_PAYMENT_LINK__: JSON.stringify(env.VITE_STRIPE_PAYMENT_LINK || defaultStripePaymentLink),
      __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL || defaultApiBaseUrl),
      __EXTENSION_VERSION__: JSON.stringify(packageJson.version || "0.3.0"),
      __PROFILE_EXTRACTION_DEBUG__: JSON.stringify(env.VITE_PROFILE_EXTRACTION_DEBUG === "true")
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, "popup.html"),
          options: resolve(__dirname, "options.html"),
          contentScript: resolve(__dirname, "src/contentScript.tsx"),
          background: resolve(__dirname, "src/background.ts")
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]"
        }
      }
    }
  };
});
