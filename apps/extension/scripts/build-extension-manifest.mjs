/* global console, process, URL */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve("dist", "manifest.json");
const defaultApiBaseUrl = "https://linkedin-hubspot-ai-assistant.onrender.com";
const apiBaseUrl = process.env.VITE_API_BASE_URL?.trim() || defaultApiBaseUrl;

function apiHostPermissions() {
  try {
    const url = new URL(apiBaseUrl);
    return [`${url.origin}/*`];
  } catch {
    throw new Error("VITE_API_BASE_URL must be a valid absolute URL.");
  }
}

const rawManifest = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(rawManifest);
manifest.host_permissions = ["https://www.linkedin.com/*", "https://*.linkedin.com/*", ...apiHostPermissions()];

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Extension manifest host permissions: ${manifest.host_permissions.join(", ")}`);
