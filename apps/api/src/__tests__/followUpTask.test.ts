import { afterEach, describe, expect, it, vi } from "vitest";
import { HubSpotService } from "../services/hubspot.service.js";
import { AppError, sanitizeSensitiveData } from "../utils/errors.js";
import {
  buildFollowUpTaskFallbackNoteBody,
  mapFollowUpTaskError,
  sanitizeFollowUpTaskRequestShape,
  shouldCreateFollowUpFallbackNote,
  validateFollowUpTaskRequest
} from "../utils/followUpTask.js";

const profile = {
  fullName: "Avery Johnson",
  profileUrl: "https://www.linkedin.com/in/avery-johnson/",
  linkedinUrl: "https://www.linkedin.com/in/avery-johnson/",
  companyName: "Example Corp"
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;
});

describe("follow-up task request validation", () => {
  it("returns a sanitized request shape without raw body contents", () => {
    expect(
      sanitizeFollowUpTaskRequestShape({
        contactId: "12345",
        profile,
        daysFromNow: 3,
        taskTitle: "Follow up",
        taskBody: "Use the DM draft."
      })
    ).toEqual({
      hasContactId: true,
      hasProfile: true,
      hasProfileName: true,
      hasProfileUrl: true,
      hasTaskTitle: true,
      hasTaskBody: true,
      daysFromNow: 3,
      daysFromNowType: "number"
    });
  });

  it("blocks task creation when contact ID is missing", () => {
    expect(() =>
      validateFollowUpTaskRequest({
        profile,
        daysFromNow: 3,
        taskTitle: "Follow up",
        taskBody: "Use the DM draft."
      })
    ).toThrow("Please add this profile to HubSpot before creating a follow-up task.");
  });

  it("blocks task creation when profile data is missing", () => {
    try {
      validateFollowUpTaskRequest({
        contactId: "12345",
        daysFromNow: 3,
        taskTitle: "Follow up",
        taskBody: "Use the DM draft."
      });
      throw new Error("Expected validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(400);
      expect((error as AppError).code).toBe("MISSING_PROFILE");
    }
  });

  it("builds fallback note content with task context and LinkedIn URL", () => {
    const request = validateFollowUpTaskRequest(
      {
        contactId: "12345",
        profile,
        daysFromNow: 3,
        taskTitle: "Follow up",
        taskBody: "Use the DM draft."
      },
      new Date("2026-06-06T00:00:00.000Z")
    );

    expect(buildFollowUpTaskFallbackNoteBody(request)).toContain("Follow-up task requested:");
    expect(buildFollowUpTaskFallbackNoteBody(request)).toContain("Use the DM draft.");
    expect(buildFollowUpTaskFallbackNoteBody(request)).toContain("2026-06-09T00:00:00.000Z");
    expect(buildFollowUpTaskFallbackNoteBody(request)).toContain("https://www.linkedin.com/in/avery-johnson/");
  });
});

describe("HubSpot follow-up task creation", () => {
  it("creates a HubSpot task associated with the synced contact ID", async () => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "pat-secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "task-123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const taskId = await new HubSpotService().createFollowUpTask(
      "contact-123",
      "Follow up",
      "Use the DM draft.\n\nLinkedIn profile: https://www.linkedin.com/in/avery-johnson/",
      "2026-06-09T00:00:00.000Z"
    );

    expect(taskId).toBe("task-123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/tasks",
      expect.objectContaining({
        method: "POST"
      })
    );

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      properties: Record<string, string>;
      associations: Array<{ to: { id: string }; types: Array<{ associationTypeId: number }> }>;
    };

    expect(body.properties).toMatchObject({
      hs_timestamp: "2026-06-09T00:00:00.000Z",
      hs_task_subject: "Follow up",
      hs_task_status: "NOT_STARTED",
      hs_task_priority: "MEDIUM",
      hs_task_type: "TODO"
    });
    expect(body.properties.hs_task_body).toContain("LinkedIn profile");
    expect(body.associations[0]?.to.id).toBe("contact-123");
    expect(body.associations[0]?.types[0]?.associationTypeId).toBe(204);
  });

  it("maps invalid HubSpot task payload errors to structured 400 errors", async () => {
    const hubSpotError = new AppError(
      400,
      "HubSpot could not sync the contact because the request was not valid.",
      ["Property values were not valid"],
      {
        provider: "hubspot",
        path: "/crm/v3/objects/tasks",
        status: 400,
        responseBody: {
          message: "Property values were not valid",
          category: "VALIDATION_ERROR"
        }
      }
    );

    const mappedError = mapFollowUpTaskError(hubSpotError);
    expect(mappedError.statusCode).toBe(400);
    expect(mappedError.code).toBe("INVALID_HUBSPOT_TASK_PAYLOAD");
    expect(mappedError.message).toBe("The HubSpot follow-up task payload is invalid.");
  });

  it("maps missing HubSpot task scope errors to structured 403 errors", () => {
    const hubSpotError = new AppError(403, "HubSpot permission scope is missing.", undefined, {
      provider: "hubspot",
      path: "/crm/v3/objects/tasks",
      status: 403,
      responseBody: {
        message: "Missing scopes: crm.objects.tasks.write",
        category: "MISSING_SCOPES"
      }
    });

    const mappedError = mapFollowUpTaskError(hubSpotError);
    expect(mappedError.statusCode).toBe(403);
    expect(mappedError.code).toBe("HUBSPOT_TASK_PERMISSION_MISSING");
    expect(mappedError.message).toBe("HubSpot task permission is missing. Please update your HubSpot Private App scopes.");
  });

  it("maps HubSpot temporary failures to structured retryable errors", () => {
    const hubSpotError = new AppError(500, "HubSpot is having a server problem.", undefined, {
      provider: "hubspot",
      path: "/crm/v3/objects/tasks",
      status: 500,
      responseBody: {
        message: "Internal error",
        category: "SERVER_ERROR"
      }
    });

    const mappedError = mapFollowUpTaskError(hubSpotError);
    expect(mappedError.statusCode).toBe(502);
    expect(mappedError.code).toBe("HUBSPOT_TEMPORARY_FAILURE");
    expect(mappedError.message).toBe("HubSpot could not create the follow-up task. Please try again.");
  });

  it("detects when fallback note creation is safe for unavailable task support", () => {
    const hubSpotError = new AppError(404, "Object type tasks was not found.", undefined, {
      provider: "hubspot",
      path: "/crm/v3/objects/tasks",
      status: 404,
      responseBody: {
        message: "Object type tasks was not found."
      }
    });

    expect(shouldCreateFollowUpFallbackNote(hubSpotError)).toBe(true);
  });

  it("does not leak secrets through sanitized diagnostic data", () => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "pat-secret";

    expect(
      sanitizeSensitiveData({
        route: "follow-up-task",
        authorization: "Bearer pat-secret",
        message: "HubSpot rejected pat-secret"
      })
    ).toEqual({
      route: "follow-up-task",
      authorization: "[redacted]",
      message: "HubSpot rejected [redacted]"
    });
  });
});
