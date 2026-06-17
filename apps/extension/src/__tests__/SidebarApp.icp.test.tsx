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
});
