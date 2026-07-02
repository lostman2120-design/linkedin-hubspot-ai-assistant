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
  it("starts with a disabled template placeholder without changing Seller Context", async () => {
    await renderOptions();

    const select = container?.querySelector<HTMLSelectElement>("#sellerContextTemplate");
    const placeholder = select?.querySelector<HTMLOptionElement>('option[value=""]');
    const applyButton = Array.from(container?.querySelectorAll("button") ?? []).find((button) => button.textContent === "Apply template");
    const productNameInput = container?.querySelector<HTMLInputElement>("#sellerContext-productOrServiceName");

    expect(select?.value).toBe("");
    expect(select?.selectedOptions[0]?.textContent).toBe("Select a starter template...");
    expect(placeholder?.disabled).toBe(true);
    expect(applyButton?.hasAttribute("disabled")).toBe(true);
    expect(productNameInput?.value).toBe(DEFAULT_USER_SETTINGS.sellerContext.productOrServiceName);
  });

  it("loads saved Seller Context while keeping the template selector on its placeholder", async () => {
    const savedSettings = {
      ...DEFAULT_USER_SETTINGS,
      sellerContext: {
        ...DEFAULT_USER_SETTINGS.sellerContext,
        productOrServiceName: "Saved Customer Product",
        brandVoice: "Saved customer voice"
      }
    };

    await renderOptions({ [SETTINGS_KEY]: savedSettings });

    const select = container?.querySelector<HTMLSelectElement>("#sellerContextTemplate");
    const productNameInput = container?.querySelector<HTMLInputElement>("#sellerContext-productOrServiceName");
    const brandVoiceInput = container?.querySelector<HTMLTextAreaElement>("#sellerContext-brandVoice");

    expect(select?.value).toBe("");
    expect(select?.selectedOptions[0]?.textContent).toBe("Select a starter template...");
    expect(productNameInput?.value).toBe("Saved Customer Product");
    expect(brandVoiceInput?.value).toBe("Saved customer voice");
  });

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

  it("asks before replacing existing Seller Context and applies the selected template after confirmation", async () => {
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderOptions();

    const select = container?.querySelector<HTMLSelectElement>("#sellerContextTemplate");
    const applyButton = Array.from(container?.querySelectorAll("button") ?? []).find((button) => button.textContent === "Apply template");
    const productNameInput = container?.querySelector<HTMLInputElement>("#sellerContext-productOrServiceName");

    expect(productNameInput?.value).toBe(DEFAULT_USER_SETTINGS.sellerContext.productOrServiceName);

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
      valueSetter?.call(select, "hubspot-consultant");
      select?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(productNameInput?.value).toBe(DEFAULT_USER_SETTINGS.sellerContext.productOrServiceName);

    await act(async () => {
      applyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(confirmMock).toHaveBeenCalled();
    expect(productNameInput?.value).toBe(DEFAULT_USER_SETTINGS.sellerContext.productOrServiceName);

    confirmMock.mockReturnValue(true);
    await act(async () => {
      applyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(productNameInput?.value).toBe("HubSpot consulting and implementation");
    expect(container?.textContent).toContain("template applied");
  });
});
