import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type ExtensionManifest = {
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: Array<{
    matches?: string[];
    js?: string[];
  }>;
};

function readPublicManifest(): ExtensionManifest {
  return JSON.parse(readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8")) as ExtensionManifest;
}

describe("extension manifest permissions", () => {
  it("keeps only the storage permission and avoids unused MV3 dynamic injection permissions", () => {
    const manifest = readPublicManifest();

    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.permissions).toContain("storage");
    expect(manifest.permissions).not.toContain("activeTab");
    expect(manifest.permissions).not.toContain("scripting");
  });

  it("keeps static LinkedIn content scripts and the production Render API host permission", () => {
    const manifest = readPublicManifest();
    const matches = manifest.content_scripts?.flatMap((script) => script.matches ?? []) ?? [];

    expect(matches).toContain("https://www.linkedin.com/in/*");
    expect(matches).toContain("https://*.linkedin.com/in/*");
    expect(manifest.host_permissions).toContain("https://linkedin-hubspot-ai-assistant.onrender.com/*");
  });
});
