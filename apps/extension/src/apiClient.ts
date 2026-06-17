import { incrementTodayUsageCount } from "./storage";

type ApiRequestPayload = {
  type: "API_REQUEST";
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
};

type ApiResponse<T> = {
  ok: boolean;
  status?: number;
  statusCode?: number;
  code?: string;
  data?: T;
  error?: string;
  details?: string[];
};

export async function apiRequest<T>(
  endpoint: string,
  options: { method?: "GET" | "POST"; body?: unknown; trackUsage?: boolean } = {}
): Promise<T> {
  const method = options.method ?? "GET";
  console.log("[apiClient] Sending API request to background service worker.", {
    endpoint,
    method
  });

  const response = await sendApiRequestMessage<T>({
    type: "API_REQUEST",
    endpoint,
    method,
    body: options.body
  });

  console.log("[apiClient] API response received from background service worker.", {
    endpoint,
    method,
    hasResponse: Boolean(response),
    ok: response?.ok,
    status: response?.status,
    statusCode: response?.statusCode,
    code: response?.code,
    error: response?.error
  });

  if (!response) {
    throw new Error("No response from extension background service worker");
  }

  if (!response.ok) {
    const shouldHideDetails = response.details?.some((detail) => /(visibleTextSample|visibleProfileContext\.rawVisibleContext)/.test(detail));
    const details = !shouldHideDetails && response.details && response.details.length > 0 ? ` ${response.details.join(" ")}` : "";
    const status = response.statusCode && response.statusCode > 0 ? ` (${response.statusCode})` : "";
    throw new Error(`${response.error ?? "The API request failed."}${status}${details}`);
  }

  if (options.trackUsage !== false) {
    await incrementTodayUsageCount();
  }

  return response.data as T;
}

function sendApiRequestMessage<T>(payload: ApiRequestPayload): Promise<ApiResponse<T> | undefined> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(payload, (response: ApiResponse<T> | undefined) => {
        const lastError = chrome.runtime.lastError;

        if (lastError) {
          const message = lastError.message || "Unknown chrome.runtime.sendMessage error";
          console.error("[apiClient] chrome.runtime.sendMessage failed.", {
            endpoint: payload.endpoint,
            method: payload.method,
            message
          });
          reject(new Error(`Chrome runtime message failed: ${message}`));
          return;
        }

        resolve(response);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sendMessage exception";
      console.error("[apiClient] chrome.runtime.sendMessage threw before a response was received.", {
        endpoint: payload.endpoint,
        method: payload.method,
        message
      });
      reject(error);
    }
  });
}
