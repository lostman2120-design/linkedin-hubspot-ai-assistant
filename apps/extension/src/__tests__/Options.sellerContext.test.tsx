// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import { Options } from "../options/Options";
import { LICENSE_STATE_KEY, SETTINGS_KEY } from "../storage";

type StorageData = Record<string, unknown>;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let storageData: StorageData = {};
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

async function renderOptions(initialStorage: StorageData = {}) {
  storageData = {
    [SETTINGS_KEY]: DEFAULT_USER_SETTINGS,
    [LICENSE_STATE_KEY]: { valid: false, plan: "free", status: "none" },
    ...initialStorage
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<Options />);
    await Promise.resolve();
    await Promise.resolve();
  });

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
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
      sendMessage: vi.fn()
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

describe("Options Seller Context section", () => {
  it("renders Seller Context fields and saves edited values", async () => {
    await renderOptions();

    expect(container?.textContent).toContain("Seller Context");
    expect(container?.textContent).toContain("Product or service name");
    expect(container?.textContent).toContain("Compatibility or coexistence context");

    const productNameInput = container?.querySelector<HTMLInputElement>("#sellerContext-productOrServiceName");
    expect(productNameInput).toBeTruthy();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(productNameInput, "WorkflowOS");
      productNameInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = container?.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const saved = storageData[SETTINGS_KEY] as typeof DEFAULT_USER_SETTINGS;
    expect(saved.sellerContext.productOrServiceName).toBe("WorkflowOS");
    expect(saved.targetRoles).toBe(DEFAULT_USER_SETTINGS.targetRoles);
    expect(container?.textContent).toContain("Settings saved.");
  });
});
