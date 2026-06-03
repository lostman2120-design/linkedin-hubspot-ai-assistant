import { getStoredSettings } from "./storage";

type ApiRequestMessage = {
  type?: string;
  endpoint?: string;
  method?: "GET" | "POST";
  body?: unknown;
};

type ApiResponse = {
  ok: boolean;
  statusCode?: number;
  data?: unknown;
  error?: string;
  details?: string[];
};

function joinApiUrl(baseUrl: string, endpoint: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  return new URL(normalizedEndpoint, normalizedBase).toString();
}

async function handleApiRequest(message: ApiRequestMessage): Promise<ApiResponse> {
  if (!message.endpoint || !message.method) {
    return { ok: false, statusCode: 400, error: "The extension sent an incomplete API request." };
  }

  const settings = await getStoredSettings();
  let response: Response;
  try {
    response = await fetch(joinApiUrl(settings.backendApiUrl, message.endpoint), {
      method: message.method,
      headers: {
        "Content-Type": "application/json"
      },
      body: message.method === "POST" ? JSON.stringify(message.body ?? {}) : undefined
    });
  } catch {
    return {
      ok: false,
      statusCode: 0,
      error: "Backend API is not reachable. Check that the API is running and the Backend API URL in Options is correct."
    };
  }

  const text = await response.text();
  const data = parseJsonResponse(text);

  if (!response.ok) {
    const errorData = typeof data === "object" && data !== null ? (data as { error?: string; details?: string[]; statusCode?: number }) : undefined;
    return {
      ok: false,
      statusCode: errorData?.statusCode ?? response.status,
      error: errorData?.error ?? messageForBackendStatus(response.status),
      details: errorData?.details
    };
  }

  return { ok: true, data };
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

chrome.runtime.onMessage.addListener((message: ApiRequestMessage, _sender, sendResponse) => {
  if (message.type !== "API_REQUEST") {
    return false;
  }

  void handleApiRequest(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      const messageText =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Backend API is not reachable. Check that the API is running and the Backend API URL in Options is correct.";
      sendResponse({ ok: false, statusCode: 0, error: messageText });
    });

  return true;
});
