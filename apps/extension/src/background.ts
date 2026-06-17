type ApiRequestMessage = {
  type?: string;
  endpoint?: string;
  method?: "GET" | "POST";
  body?: unknown;
};

type RuntimeMessage = ApiRequestMessage | { type?: "OPEN_OPTIONS_PAGE" };

type ApiResponse = {
  ok: boolean;
  status?: number;
  statusCode?: number;
  code?: string;
  data?: unknown;
  error?: string;
  details?: string[];
};

const DEFAULT_BACKEND_API_URL = "https://linkedin-hubspot-ai-assistant.onrender.com";
const SETTINGS_KEY = "linkedinHubspotAiAssistant.settings";

function joinApiUrl(baseUrl: string, endpoint: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  return new URL(normalizedEndpoint, normalizedBase).toString();
}

async function getBackendApiUrl(): Promise<string> {
  try {
    const result = await chrome.storage.sync.get([SETTINGS_KEY, "backendApiUrl"]);
    const directBackendApiUrl = readNonEmptyString(result.backendApiUrl);
    if (directBackendApiUrl) {
      return directBackendApiUrl;
    }

    const settings = result[SETTINGS_KEY];
    if (typeof settings === "object" && settings !== null) {
      const storedBackendApiUrl = readNonEmptyString((settings as { backendApiUrl?: unknown }).backendApiUrl);
      if (storedBackendApiUrl) {
        return storedBackendApiUrl;
      }
    }
  } catch {
    // Keep the MV3 service worker resilient if Chrome storage is temporarily unavailable.
  }

  return DEFAULT_BACKEND_API_URL;
}

async function handleApiRequest(message: ApiRequestMessage): Promise<ApiResponse> {
  if (!message.endpoint || !message.method) {
    console.error("[background] API request was incomplete.", {
      endpoint: message.endpoint,
      method: message.method
    });
    return { ok: false, status: 400, statusCode: 400, error: "The extension sent an incomplete API request." };
  }

  const backendApiUrl = await getBackendApiUrl();
  const finalUrl = joinApiUrl(backendApiUrl, message.endpoint);
  console.log("[background] API request prepared.", {
    endpoint: message.endpoint,
    method: message.method,
    backendApiUrl,
    finalUrl
  });

  let response: Response;
  try {
    response = await fetch(finalUrl, {
      method: message.method,
      headers: {
        "Content-Type": "application/json"
      },
      body: message.method === "POST" ? JSON.stringify(message.body ?? {}) : undefined
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown fetch error";
    console.error("[background] API fetch failed.", {
      endpoint: message.endpoint,
      method: message.method,
      finalUrl,
      message: messageText
    });
    return {
      ok: false,
      status: 0,
      statusCode: 0,
      error: `Failed to fetch ${finalUrl}: ${messageText}`
    };
  }

  const text = await response.text();
  const data = parseJsonResponse(text);
  console.log("[background] API response received.", {
    endpoint: message.endpoint,
    method: message.method,
    finalUrl,
    ok: response.ok,
    status: response.status,
    hasBody: text.length > 0
  });

  if (!response.ok) {
    const errorData =
      typeof data === "object" && data !== null
        ? (data as { code?: string; error?: string; details?: string[]; statusCode?: number })
        : undefined;
    return {
      ok: false,
      status: errorData?.statusCode ?? response.status,
      statusCode: errorData?.statusCode ?? response.status,
      code: errorData?.code,
      error: errorData?.error ?? messageForBackendStatus(response.status),
      details: errorData?.details
    };
  }

  return { ok: true, status: response.status, statusCode: response.status, data };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseJsonResponse(text: string): unknown {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function messageForBackendStatus(status: number): string {
  if (status === 400) {
    return "The backend API could not use the request because some data was missing or invalid.";
  }

  if (status === 401) {
    return "The backend API rejected the request because authentication failed.";
  }

  if (status === 403) {
    return "The backend API rejected the request because permission is missing.";
  }

  if (status === 429) {
    return "Too many requests. Please wait a few minutes and try again.";
  }

  if (status >= 500) {
    return "The backend API had a server error. Please try again in a moment.";
  }

  return "The backend API returned an error.";
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  console.log("[background] runtime message received.", {
    type: message?.type,
    endpoint: message?.endpoint,
    method: message?.method
  });

  if (message?.type === "OPEN_OPTIONS_PAGE") {
    try {
      chrome.runtime.openOptionsPage(() => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("[background] Failed to open Options page.", {
            message: lastError.message
          });
          sendResponse({ ok: false, error: lastError.message || "Options page could not be opened." });
          return;
        }

        sendResponse({ ok: true });
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Options page could not be opened.";
      console.error("[background] Failed to open Options page.", {
        message: messageText
      });
      sendResponse({ ok: false, error: messageText });
    }

    return true;
  }

  if (message?.type !== "API_REQUEST") {
    return false;
  }

  void handleApiRequest(message)
    .then((response) => {
      console.log("[background] Sending API response back to extension UI.", {
        endpoint: message.endpoint,
        method: message.method,
        ok: response.ok,
        statusCode: response.statusCode,
        hasData: typeof response.data !== "undefined",
        error: response.error
      });
      sendResponse(response);
    })
    .catch((error: unknown) => {
      const messageText =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Backend API is not reachable. Check that the API is running and the Backend API URL in Options is correct.";
      console.error("[background] API request handler failed before sendResponse.", {
        endpoint: message.endpoint,
        method: message.method,
        message: messageText
      });
      sendResponse({ ok: false, status: 0, statusCode: 0, error: messageText });
    });

  return true;
});
