declare const __API_BASE_URL__: string | undefined;

const injectedApiBaseUrl =
  typeof __API_BASE_URL__ === "string" && __API_BASE_URL__.trim() ? __API_BASE_URL__.trim() : "";

export const EXTENSION_DEFAULT_API_BASE_URL = injectedApiBaseUrl || "http://localhost:8787";
