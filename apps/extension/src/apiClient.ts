import { incrementTodayUsageCount } from "./storage";

type ApiRequestPayload = {
  type: "API_REQUEST";
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
};

type ApiResponse<T> = {
  ok: boolean;
  statusCode?: number;
  data?: T;
  error?: string;
  details?: string[];
};

export async function apiRequest<T>(
  endpoint: string,
  options: { method?: "GET" | "POST"; body?: unknown; trackUsage?: boolean } = {}
): Promise<T> {
  const response = (await chrome.runtime.sendMessage({
    type: "API_REQUEST",
    endpoint,
    method: options.method ?? "GET",
    body: options.body
  } satisfies ApiRequestPayload)) as ApiResponse<T> | undefined;

  if (!response) {
    throw new Error("The extension could not reach the background service. Please reload the extension.");
  }

  if (!response.ok) {
    const details = response.details && response.details.length > 0 ? ` ${response.details.join(" ")}` : "";
    const status = response.statusCode && response.statusCode > 0 ? ` (${response.statusCode})` : "";
    throw new Error(`${response.error ?? "The API request failed."}${status}${details}`);
  }

  if (options.trackUsage !== false) {
    await incrementTodayUsageCount();
  }

  return response.data as T;
}
