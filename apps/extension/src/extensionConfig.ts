declare const __API_BASE_URL__: string | undefined;
declare const __EXTENSION_VERSION__: string | undefined;

const injectedApiBaseUrl =
  typeof __API_BASE_URL__ === "string" && __API_BASE_URL__.trim() ? __API_BASE_URL__.trim() : "";

export const EXTENSION_DEFAULT_API_BASE_URL = injectedApiBaseUrl || "https://linkedin-hubspot-ai-assistant.onrender.com";
export const EXTENSION_VERSION =
  typeof __EXTENSION_VERSION__ === "string" && __EXTENSION_VERSION__.trim() ? __EXTENSION_VERSION__.trim() : "0.3.0";
