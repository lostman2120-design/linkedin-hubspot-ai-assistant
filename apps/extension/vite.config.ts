import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const defaultStripePaymentLink = "https://buy.stripe.com/4gMdR94zOalH6pebny8Vi00";
const defaultApiBaseUrl = "http://localhost:8787";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");

  return {
    plugins: [react()],
    define: {
      __STRIPE_PAYMENT_LINK__: JSON.stringify(env.VITE_STRIPE_PAYMENT_LINK || defaultStripePaymentLink),
      __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL || defaultApiBaseUrl)
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
