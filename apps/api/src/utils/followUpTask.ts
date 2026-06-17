import type { LinkedInProfile } from "@linkedin-hubspot-ai/shared";
import { CreateTaskRequestSchema, getProfileUrl, validateLinkedInProfileIdentity } from "@linkedin-hubspot-ai/shared";
import { AppError, formatZodError } from "./errors.js";

export type ValidFollowUpTaskRequest = {
  contactId: string;
  profile: LinkedInProfile;
  profileUrl: string;
  daysFromNow: number;
  taskTitle: string;
  taskBody: string;
  dueAt: string;
};

export type FollowUpTaskSuccessResponse =
  | {
      taskId: string;
      fallback: false;
      createdAs: "task";
      message: "HubSpot follow-up task created.";
    }
  | {
      noteId: string;
      fallback: true;
      createdAs: "note";
      message: "Follow-up note created because HubSpot task creation is not available.";
    };

type HubSpotLogDetails = {
  provider?: string;
  path?: string;
  status?: number;
  statusText?: string;
  responseBody?: unknown;
};

type HubSpotErrorSummary = {
  status?: number;
  category?: string;
  message?: string;
  path?: string;
};

export function sanitizeFollowUpTaskRequestShape(input: unknown): Record<string, unknown> {
  const value = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const profile = typeof value.profile === "object" && value.profile !== null ? (value.profile as Record<string, unknown>) : {};

  return {
    hasContactId: typeof value.contactId === "string" && value.contactId.trim().length > 0,
    hasProfile: Boolean(value.profile),
    hasProfileName: typeof profile.fullName === "string" && profile.fullName.trim().length > 0,
    hasProfileUrl:
      (typeof profile.profileUrl === "string" && profile.profileUrl.trim().length > 0) ||
      (typeof profile.linkedinUrl === "string" && profile.linkedinUrl.trim().length > 0),
    hasTaskTitle: typeof value.taskTitle === "string" && value.taskTitle.trim().length > 0,
    hasTaskBody: typeof value.taskBody === "string" && value.taskBody.trim().length > 0,
    daysFromNow: value.daysFromNow,
    daysFromNowType: typeof value.daysFromNow
  };
}

export function validateFollowUpTaskRequest(input: unknown, now = new Date()): ValidFollowUpTaskRequest {
  const rawInput = typeof input === "object" && input !== null ? (input as { contactId?: unknown; profile?: unknown }) : {};
  const rawContactId = typeof rawInput.contactId === "string" ? rawInput.contactId.trim() : "";

  if (!rawContactId) {
    throw new AppError(
      400,
      "Please add this profile to HubSpot before creating a follow-up task.",
      undefined,
      { hasContactId: false },
      "MISSING_CONTACT_ID"
    );
  }

  if (!rawInput.profile) {
    throw new AppError(
      400,
      "Profile information is missing. Please analyze the LinkedIn profile again.",
      undefined,
      { hasProfile: false },
      "MISSING_PROFILE"
    );
  }

  const parsed = CreateTaskRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new AppError(
      400,
      "The HubSpot follow-up task payload is invalid.",
      formatZodError(parsed.error),
      { issues: parsed.error.issues },
      "INVALID_HUBSPOT_TASK_PAYLOAD"
    );
  }

  if (!parsed.data.profile) {
    throw new AppError(
      400,
      "Profile information is missing. Please analyze the LinkedIn profile again.",
      undefined,
      { hasProfile: false },
      "MISSING_PROFILE"
    );
  }

  const validation = validateLinkedInProfileIdentity(parsed.data.profile);
  if (!validation.ok) {
    throw new AppError(
      400,
      "Profile information is missing. Please analyze the LinkedIn profile again.",
      [validation.message],
      { validationReason: validation.reason },
      "MISSING_PROFILE"
    );
  }

  return {
    contactId: rawContactId,
    profile: parsed.data.profile,
    profileUrl: getProfileUrl(parsed.data.profile),
    daysFromNow: parsed.data.daysFromNow,
    taskTitle: parsed.data.taskTitle,
    taskBody: parsed.data.taskBody,
    dueAt: buildFollowUpDueAt(parsed.data.daysFromNow, now)
  };
}

export function buildFollowUpDueAt(daysFromNow: number, now = new Date()): string {
  return new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

export function buildFollowUpTaskBody(taskBody: string, profileUrl: string): string {
  return `${taskBody.trim()}\n\nLinkedIn profile: ${profileUrl}`;
}

export function buildFollowUpTaskFallbackNoteBody(request: ValidFollowUpTaskRequest): string {
  return [
    "<strong>Follow-up task requested:</strong>",
    `<br><strong>Suggested follow-up message:</strong><br>${escapeHtml(request.taskBody)}`,
    `<br><strong>Recommended follow-up timing:</strong> ${escapeHtml(request.dueAt)}`,
    `<br><strong>LinkedIn profile:</strong> ${escapeHtml(request.profileUrl)}`
  ].join("");
}

export function mapFollowUpTaskError(error: unknown): AppError {
  if (error instanceof AppError && error.code?.startsWith("MISSING_")) {
    return error;
  }

  const hubSpotError = summarizeHubSpotError(error);
  if (hubSpotError) {
    const lowerMessage = `${hubSpotError.message ?? ""} ${hubSpotError.category ?? ""}`.toLowerCase();

    if (hubSpotError.status === 403 || lowerMessage.includes("scope") || lowerMessage.includes("permission")) {
      return new AppError(
        403,
        "HubSpot task permission is missing. Please update your HubSpot Private App scopes.",
        hubSpotError.message ? [hubSpotError.message] : undefined,
        hubSpotError,
        "HUBSPOT_TASK_PERMISSION_MISSING"
      );
    }

    if (hubSpotError.status === 400) {
      return new AppError(
        400,
        "The HubSpot follow-up task payload is invalid.",
        hubSpotError.message ? [hubSpotError.message] : undefined,
        hubSpotError,
        "INVALID_HUBSPOT_TASK_PAYLOAD"
      );
    }

    if (hubSpotError.status === 429 || (hubSpotError.status !== undefined && hubSpotError.status >= 500)) {
      return new AppError(
        hubSpotError.status >= 500 ? 502 : 503,
        "HubSpot could not create the follow-up task. Please try again.",
        hubSpotError.message ? [hubSpotError.message] : undefined,
        hubSpotError,
        "HUBSPOT_TEMPORARY_FAILURE"
      );
    }
  }

  if (error instanceof AppError) {
    return new AppError(
      error.statusCode,
      error.message,
      error.details,
      error.logDetails,
      error.code ?? "FOLLOW_UP_TASK_INTERNAL_ERROR"
    );
  }

  return new AppError(
    500,
    "Could not create the follow-up task. Please try again.",
    undefined,
    error instanceof Error ? { message: error.message, stack: error.stack } : error,
    "FOLLOW_UP_TASK_INTERNAL_ERROR"
  );
}

export function shouldCreateFollowUpFallbackNote(error: unknown): boolean {
  const hubSpotError = summarizeHubSpotError(error);
  if (!hubSpotError) {
    return false;
  }

  const lowerMessage = `${hubSpotError.message ?? ""} ${hubSpotError.category ?? ""}`.toLowerCase();
  return (
    hubSpotError.status === 404 ||
    hubSpotError.status === 405 ||
    hubSpotError.status === 501 ||
    lowerMessage.includes("task creation is not available") ||
    lowerMessage.includes("tasks are not available") ||
    lowerMessage.includes("object type tasks")
  );
}

export function summarizeHubSpotError(error: unknown): HubSpotErrorSummary | null {
  if (!(error instanceof AppError) || typeof error.logDetails !== "object" || error.logDetails === null) {
    return null;
  }

  const details = error.logDetails as HubSpotLogDetails;
  if (details.provider !== "hubspot") {
    return null;
  }

  const responseBody = typeof details.responseBody === "object" && details.responseBody !== null ? details.responseBody : {};
  const body = responseBody as {
    message?: string;
    category?: string;
    errors?: Array<{ message?: string }>;
    validationResults?: Array<{ message?: string; error?: string; propertyName?: string }>;
  };

  const messages = [
    body.message,
    ...(body.errors?.map((item) => item.message) ?? []),
    ...(body.validationResults?.map((item) => {
      const property = item.propertyName ? `${item.propertyName}: ` : "";
      return `${property}${item.message ?? item.error ?? ""}`.trim();
    }) ?? []),
    error.message
  ]
    .map((message) => message?.trim())
    .filter((message): message is string => Boolean(message));

  return {
    status: details.status,
    category: body.category,
    message: [...new Set(messages)].join(" "),
    path: details.path
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
