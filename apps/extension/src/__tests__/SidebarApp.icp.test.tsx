// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import { SidebarApp } from "../sidebar/SidebarApp";
import { DAILY_USAGE_KEY, LICENSE_STATE_KEY, SETTINGS_KEY } from "../storage";

type StorageData = Record<string, unknown>;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let storageData: StorageData = {};
const sendMessage = vi.fn();
const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

function storageGet(keys?: string | string[] | Record<string, unknown> | null) {
  if (typeof keys === "string") {
    return Promise.resolve({ [keys]: storageData[keys] });
  }

  if (Array.isArray(keys)) {
    return Promise.resolve(Object.fromEntries(keys.map((key) => [key, storageData[key]])));
  }

  return Promise.resolve({ ...storageData });
}

async function renderSidebar(initialStorage: StorageData = {}) {
  storageData = { ...initialStorage };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<SidebarApp />);
    await Promise.resolve();
    await Promise.resolve();
  });

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  sendMessage.mockReset();
  sendMessage.mockImplementation((_message: unknown, callback?: (response: { ok: boolean }) => void) => {
    callback?.({ ok: true });
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(storageGet),
        set: vi.fn(async (items: StorageData) => {
          Object.assign(storageData, items);
        })
      },
      sync: {
        get: vi.fn(async () => ({}))
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    runtime: {
      sendMessage,
      lastError: undefined,
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`)
    }
  });
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  testGlobal.IS_REACT_ACT_ENVIRONMENT = undefined;
});

describe("Sidebar ICP summary panel", () => {
  it("renders default ICP settings and default notice", async () => {
    await renderSidebar({
      [LICENSE_STATE_KEY]: { valid: false, plan: "free", status: "none" },
      [DAILY_USAGE_KEY]: { date: "2026-06-12", profileAnalyses: 0, outreachDrafts: 0 }
    });

    expect(container?.textContent).toContain("Scoring against ICP");
    expect(container?.textContent).toContain("Using default ICP. Customize it for better scoring and DM drafts.");
    expect(container?.textContent).toContain(DEFAULT_USER_SETTINGS.targetRoles);
  });

  it("renders saved custom ICP settings", async () => {
    await renderSidebar({
      [SETTINGS_KEY]: {
        ...DEFAULT_USER_SETTINGS,
        targetRoles: "Founders, SDRs, RevOps",
        targetIndustries: "B2B SaaS, agencies",
        targetCompanySize: "1-50",
        productOrServiceDescription: "LinkedIn to HubSpot AI workflow",
        mainPainPointsSolved: "manual CRM entry, DM writing",
        preferredOutreachTone: "Soft feedback request"
      },
      [LICENSE_STATE_KEY]: { valid: true, plan: "beta_pro", status: "active" },
      [DAILY_USAGE_KEY]: { date: "2026-06-12", profileAnalyses: 0, outreachDrafts: 0 }
    });

    expect(container?.textContent).toContain("Founders, SDRs, RevOps");
    expect(container?.textContent).toContain("B2B SaaS, agencies");
    expect(container?.textContent).not.toContain("Using default ICP. Customize it for better scoring and DM drafts.");
  });

  it("opens the Options page from Edit ICP", async () => {
    await renderSidebar();

    const editButton = Array.from(container?.querySelectorAll("button") ?? []).find((button) => button.textContent === "Edit ICP");
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith({ type: "OPEN_OPTIONS_PAGE" }, expect.any(Function));
  });

  it("renders safe lead-decision and outreach-strategy empty states in the required order", async () => {
    await renderSidebar();

    const text = container?.textContent ?? "";
    expect(text).toContain("Recommended Action");
    expect(text).toContain("Analyze this profile to see whether the lead is worth pursuing.");
    expect(text).toContain("Outreach Strategy");
    expect(text.indexOf("Recommended Action")).toBeLessThan(text.indexOf("ICP Fit Score"));
    expect(text.indexOf("Outreach Strategy")).toBeLessThan(text.indexOf("DM Drafts"));
  });

  it("renders v0.5 decision intelligence sections after analysis", async () => {
    sendMessage.mockImplementation((message: unknown, callback?: (response: { ok: boolean; data?: unknown }) => void) => {
      if (typeof message === "object" && message !== null && (message as { endpoint?: string }).endpoint === "/ai/analyze-profile") {
        callback?.({
          ok: true,
          data: {
            leadScore: 72,
            fitLabel: "Possible fit",
            persona: "HubSpot consultant",
            painPoints: ["CRM workflow quality"],
            icebreaker: "Noticed your HubSpot work.",
            recommendedAction: "Research more",
            actionReason: "Strong HubSpot context is visible, but direct pain is not confirmed.",
            confidence: "medium",
            decisionConfidence: "medium",
            dataSufficiency: "partial",
            evidenceCoverage: 56,
            confidenceReason: "Profile context is limited.",
            limitedContextReasons: ["Company size missing"],
            decisionBreakdown: {
              roleFit: { status: "strong", score: 90, explanation: "HubSpot consultant role is visible.", evidence: ["HubSpot Consultant"], source: "headline", basis: "fact" },
              industryFit: { status: "strong", score: 85, explanation: "HubSpot CRM context is visible.", evidence: ["HubSpot CRM"], source: "headline", basis: "fact" },
              companyFit: { status: "missing", score: 0, explanation: "Company size is missing.", evidence: [], source: "not_available", basis: "missing" },
              buyerRelevance: { status: "moderate", score: 65, explanation: "May influence CRM workflow decisions.", evidence: [], source: "profile", basis: "inference" },
              painEvidence: { status: "weak", score: 35, explanation: "Direct pain is not confirmed.", evidence: [], source: "not_available", basis: "missing" },
              timingSignal: { status: "missing", score: 0, explanation: "No trigger visible.", evidence: [], source: "not_available", basis: "missing" },
              relationshipSignal: { status: "missing", score: 0, explanation: "No relationship context.", evidence: [], source: "not_available", basis: "missing" },
              dataSufficiency: { status: "moderate", score: 56, explanation: "Partial coverage.", evidence: [], source: "computed", basis: "fact" },
              riskLevel: { status: "weak", score: 20, explanation: "No major disqualifier.", evidence: [], source: "not_available", basis: "missing" }
            },
            decisionChangeConditions: [
              {
                condition: "Uses HubSpot internally",
                currentState: "Not confirmed",
                impactIfConfirmed: "Buyer relevance would increase.",
                recommendedActionIfConfirmed: "Pursue now"
              }
            ],
            nextBestResearchActions: [
              {
                priority: "high",
                action: "Confirm HubSpot usage.",
                reason: "This affects buyer relevance.",
                expectedDecisionImpact: "Could move the decision to Pursue now.",
                safeSourceSuggestion: "Review the visible About section"
              }
            ],
            outreachReadiness: {
              readiness: "almost_ready",
              readinessScore: 72,
              timingRecommendation: "Research first",
              reason: "Strong relevance but direct pain is not confirmed.",
              blockers: ["No direct pain evidence"],
              prerequisites: ["Confirm HubSpot usage"]
            },
            outreachCoach: {
              verdict: "Research before sending",
              message: "Review before outreach.",
              mainWarning: "Do not assume pain.",
              recommendedPreparation: "Confirm workflow context.",
              humanReviewRequired: true
            },
            outreachStrategy: {
              whyRelevant: "HubSpot relevance is visible.",
              bestAngle: "Feedback request",
              painHypothesis: "CRM workflow pain may exist but is not confirmed.",
              whatToAvoid: "Do not assume HubSpot usage.",
              suggestedCTA: "Ask for feedback."
            },
            dmVariants: []
          }
        });
        return;
      }

      callback?.({ ok: true });
    });
    vi.stubGlobal("location", {
      href: "https://www.linkedin.com/in/joris-milloux/",
      pathname: "/in/joris-milloux/"
    });
    document.title = "Joris Milloux - Consultant HubSpot CRM (Diamond Partner) | RevOps & AI | LinkedIn";
    document.body.innerHTML = `<main><section><h1>Joris Milloux</h1><div class="text-body-medium">Consultant HubSpot CRM (Diamond Partner) | RevOps & AI</div></section></main>`;

    await renderSidebar({
      [SETTINGS_KEY]: DEFAULT_USER_SETTINGS,
      [LICENSE_STATE_KEY]: { valid: true, plan: "beta_pro", status: "active" },
      [DAILY_USAGE_KEY]: { date: "2026-06-12", profileAnalyses: 0, outreachDrafts: 0 }
    });

    const analyzeButton = Array.from(container?.querySelectorAll("button") ?? []).find((button) => button.textContent?.includes("Analyze Profile"));
    await act(async () => {
      analyzeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const text = container?.textContent ?? "";
    expect(text).toContain("Outreach Readiness");
    expect(text).toContain("Decision Confidence");
    expect(text).toContain("Decision Breakdown");
    expect(text).toContain("What would change this decision?");
    expect(text).toContain("Next Best Research Action");
    expect(text).toContain("AI Outreach Coach");
    expect(text).toContain("Pain hypotheses");
    expect(text).toContain("These are not confirmed pains.");
    expect(text).toContain("Use Connection Message, First DM, or Follow-up when you want the AI to draft outreach.");
    expect(text.indexOf("Recommended Action")).toBeLessThan(text.indexOf("Outreach Readiness"));
    expect(text.indexOf("AI Outreach Coach")).toBeLessThan(text.indexOf("DM Drafts"));
  });
});
