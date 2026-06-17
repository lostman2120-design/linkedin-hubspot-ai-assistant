import type { LinkedInProfile } from "@linkedin-hubspot-ai/shared";
import { AppError } from "../utils/errors.js";
import { type HubSpotContactProperties, mapProfileToHubSpotProperties } from "../utils/hubspotMapping.js";

const HUBSPOT_API_BASE = "https://api.hubapi.com";
const NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID = 202;
const TASK_TO_CONTACT_ASSOCIATION_TYPE_ID = 204;

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

export function isHubSpotInvalidPropertyError(error: unknown): boolean {
  return error instanceof AppError && error.statusCode === 400 && /property|propertyname|invalid_property|does not exist/i.test(error.message);
}

export function getHubSpotInvalidPropertyNames(error: unknown): string[] {
  if (!(error instanceof AppError) || typeof error.logDetails !== "object" || error.logDetails === null) {
    return [];
  }

  const { responseBody } = error.logDetails as { responseBody?: HubSpotErrorResponse | string };
  if (!responseBody || typeof responseBody === "string") {
    return [];
  }

  const names = [
    ...(responseBody.validationResults?.map((result) => result.propertyName) ?? []),
    ...(responseBody.errors?.flatMap((item) => item.context?.propertyName ?? []) ?? [])
  ].filter((name): name is string => Boolean(name));

  return [...new Set(names)];
}

export class HubSpotService {
  private async requestWithStatus<T>(path: string, init: RequestInit): Promise<{ data: T; status: number }> {
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

    return {
      data: (await response.json()) as T,
      status: response.status
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    return (await this.requestWithStatus<T>(path, init)).data;
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
    return this.createContactWithProperties(mapProfileToHubSpotProperties(profile, lifecycleStage));
  }

  async createContactWithProperties(properties: HubSpotContactProperties): Promise<string> {
    const result = await this.requestWithStatus<HubSpotObjectResponse>("/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify({
        properties
      })
    });

    console.log("[hubspot-contact] Contact created.", {
      status: result.status,
      contactId: result.data.id
    });

    return result.data.id;
  }

  async updateContact(contactId: string, profile: LinkedInProfile, lifecycleStage?: string): Promise<string> {
    return this.updateContactWithProperties(contactId, mapProfileToHubSpotProperties(profile, lifecycleStage));
  }

  async updateContactWithProperties(contactId: string, properties: HubSpotContactProperties): Promise<string> {
    const result = await this.requestWithStatus<HubSpotObjectResponse>(`/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        properties
      })
    });

    console.log("[hubspot-contact] Contact updated.", {
      status: result.status,
      contactId: result.data.id
    });

    return result.data.id;
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

  async createFollowUpTask(contactId: string, taskTitle: string, taskBody: string, dueAt: string): Promise<string> {
    const path = "/crm/v3/objects/tasks";
    console.log("[follow-up-task] HubSpot task API request prepared.", {
      method: "POST",
      path,
      contactId: maskHubSpotId(contactId),
      dueAt,
      hasTaskTitle: taskTitle.trim().length > 0,
      hasTaskBody: taskBody.trim().length > 0,
      associationTypeId: TASK_TO_CONTACT_ASSOCIATION_TYPE_ID,
      hasOwnerId: false
    });

    const result = await this.requestWithStatus<HubSpotObjectResponse>(path, {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_timestamp: dueAt,
          hs_task_subject: taskTitle,
          hs_task_body: taskBody,
          hs_task_status: "NOT_STARTED",
          hs_task_priority: "MEDIUM",
          hs_task_type: "TODO"
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: TASK_TO_CONTACT_ASSOCIATION_TYPE_ID
              }
            ]
          }
        ]
      })
    });

    console.log("[follow-up-task] HubSpot task API succeeded.", {
      status: result.status,
      taskId: result.data.id
    });

    return result.data.id;
  }
}

function maskHubSpotId(value: string): string {
  const trimmedValue = value.trim();
  return trimmedValue.length <= 4 ? "****" : `****${trimmedValue.slice(-4)}`;
}
