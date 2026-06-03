import type { LinkedInProfile } from "@linkedin-hubspot-ai/shared";
import { AppError } from "../utils/errors.js";
import { mapProfileToHubSpotProperties } from "../utils/hubspotMapping.js";

const HUBSPOT_API_BASE = "https://api.hubapi.com";
const NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID = 202;

type HubSpotObjectResponse = {
  id: string;
};

type HubSpotSearchResponse = {
  results?: Array<HubSpotObjectResponse>;
};

type HubSpotErrorResponse = {
  message?: string;
  category?: string;
  correlationId?: string;
  errors?: Array<{
    message?: string;
    context?: Record<string, string[]>;
  }>;
  validationResults?: Array<{
    message?: string;
    propertyName?: string;
    error?: string;
  }>;
};

function getHubSpotToken(): string {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim();
  if (!token) {
    throw new AppError(500, "HubSpot token is missing. Add HUBSPOT_PRIVATE_APP_TOKEN to the backend .env file and restart the API.");
  }

  return token;
}

async function readHubSpotError(response: Response, path: string): Promise<AppError> {
  const rawText = await response.text().catch(() => "");
  const body = parseHubSpotErrorBody(rawText);
  const formatted = formatHubSpotApiError(response.status, response.statusText, body, rawText);

  return new AppError(response.status, formatted.message, formatted.details, {
    provider: "hubspot",
    path,
    status: response.status,
    statusText: response.statusText,
    responseBody: body ?? rawText
  });
}

function parseHubSpotErrorBody(rawText: string): HubSpotErrorResponse | null {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as HubSpotErrorResponse;
  } catch {
    return null;
  }
}

export function formatHubSpotApiError(
  status: number,
  statusText: string,
  body: HubSpotErrorResponse | null,
  rawText: string
): { message: string; details: string[] } {
  const hubSpotDetail = buildHubSpotErrorDetail(body, rawText);
  const statusLabel = `HubSpot API error (${status}${statusText ? ` ${statusText}` : ""})`;
  const hubSpotSaid = hubSpotDetail ? ` HubSpot said: ${hubSpotDetail}` : "";
  const details = buildHubSpotErrorDetails(body, hubSpotDetail);
  const lowerDetail = hubSpotDetail.toLowerCase();

  if (status === 400 && isInvalidPropertyError(lowerDetail)) {
    return {
      message: `HubSpot property name is invalid.${hubSpotSaid}`,
      details
    };
  }

  if (status === 400) {
    return {
      message: `HubSpot could not sync the contact because the request was not valid.${hubSpotSaid}`,
      details
    };
  }

  if (status === 401) {
    return {
      message: `HubSpot token is invalid or expired. Check HUBSPOT_PRIVATE_APP_TOKEN in the backend .env file.${hubSpotSaid}`,
      details
    };
  }

  if (status === 403) {
    return {
      message: `HubSpot permission scope is missing. Update the HubSpot Private App scopes, then try again.${hubSpotSaid}`,
      details
    };
  }

  if (status === 429) {
    return {
      message: `HubSpot rate limit reached. Please wait a few minutes and try again.${hubSpotSaid}`,
      details
    };
  }

  if (status >= 500) {
    return {
      message: `HubSpot is having a server problem. Please try again later.${hubSpotSaid}`,
      details
    };
  }

  return {
    message: `${statusLabel}: ${hubSpotDetail || "HubSpot could not complete the request."}`,
    details
  };
}

function buildHubSpotErrorDetail(body: HubSpotErrorResponse | null, rawText: string): string {
  if (!body) {
    return rawText.slice(0, 500).trim();
  }

  const messages = [
    body.message,
    ...(body.errors?.map((item) => item.message) ?? []),
    ...(body.validationResults?.map((item) => {
      const property = item.propertyName ? `${item.propertyName}: ` : "";
      return `${property}${item.message ?? item.error ?? ""}`.trim();
    }) ?? [])
  ]
    .map((message) => message?.trim())
    .filter((message): message is string => Boolean(message));

  const uniqueMessages = [...new Set(messages)];
  const suffixParts = [
    body.category ? `category: ${body.category}` : undefined,
    body.correlationId ? `correlationId: ${body.correlationId}` : undefined
  ].filter(Boolean);

  return [...uniqueMessages, ...suffixParts].join(" ");
}

function buildHubSpotErrorDetails(body: HubSpotErrorResponse | null, hubSpotDetail: string): string[] {
  const details = [
    hubSpotDetail,
    body?.category ? `HubSpot category: ${body.category}` : undefined,
    body?.correlationId ? `HubSpot correlation ID: ${body.correlationId}` : undefined
  ].filter((detail): detail is string => Boolean(detail));

  return [...new Set(details)];
}

function isInvalidPropertyError(lowerDetail: string): boolean {
  return (
    lowerDetail.includes("property") ||
    lowerDetail.includes("propertyname") ||
    lowerDetail.includes("invalid_property") ||
    lowerDetail.includes("does not exist")
  );
}

export class HubSpotService {
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${HUBSPOT_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${getHubSpotToken()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      throw await readHubSpotError(response, path);
    }

    return (await response.json()) as T;
  }

  async searchContactByLinkedInUrl(profileUrl: string): Promise<string | null> {
    const result = await this.request<HubSpotSearchResponse>("/crm/v3/objects/contacts/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "hs_linkedin_url",
                operator: "EQ",
                value: profileUrl
              }
            ]
          }
        ],
        properties: ["firstname", "lastname", "jobtitle", "company", "hs_linkedin_url"],
        limit: 1
      })
    });

    return result.results?.[0]?.id ?? null;
  }

  async createContact(profile: LinkedInProfile, lifecycleStage?: string): Promise<string> {
    const result = await this.request<HubSpotObjectResponse>("/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify({
        properties: mapProfileToHubSpotProperties(profile, lifecycleStage)
      })
    });

    return result.id;
  }

  async updateContact(contactId: string, profile: LinkedInProfile, lifecycleStage?: string): Promise<string> {
    const result = await this.request<HubSpotObjectResponse>(`/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        properties: mapProfileToHubSpotProperties(profile, lifecycleStage)
      })
    });

    return result.id;
  }

  async createNoteForContact(contactId: string, noteBody: string): Promise<string> {
    const result = await this.request<HubSpotObjectResponse>("/crm/v3/objects/notes", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: noteBody
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID
              }
            ]
          }
        ]
      })
    });

    return result.id;
  }

  async createFollowUpTask(contactId: string, taskTitle: string, taskBody: string, dueDate: string): Promise<string> {
    const noteBody = [
      "<strong>Follow-up Task</strong>",
      `<br><strong>Title:</strong> ${escapeHtml(taskTitle)}`,
      `<br><strong>Due date:</strong> ${escapeHtml(dueDate)}`,
      `<br><strong>Details:</strong><br>${escapeHtml(taskBody)}`
    ].join("");

    return this.createNoteForContact(contactId, noteBody);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
