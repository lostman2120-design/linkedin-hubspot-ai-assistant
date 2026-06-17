import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openExtensionOptionsPage } from "../optionsNavigation";

const sendMessage = vi.fn();

beforeEach(() => {
  sendMessage.mockReset();
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage,
      lastError: undefined
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Options navigation helper", () => {
  it("opens the Options page through the background service worker", async () => {
    sendMessage.mockImplementation((_message, callback) => {
      callback({ ok: true });
    });

    await expect(openExtensionOptionsPage()).resolves.toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith({ type: "OPEN_OPTIONS_PAGE" }, expect.any(Function));
  });

  it("returns a structured error when opening Options fails", async () => {
    sendMessage.mockImplementation((_message, callback) => {
      callback({ ok: false, error: "Options page could not be opened." });
    });

    await expect(openExtensionOptionsPage()).resolves.toEqual({
      ok: false,
      error: "Options page could not be opened."
    });
  });

  it("does not construct a raw chrome-extension URL from the content script", async () => {
    sendMessage.mockImplementation((_message, callback) => {
      callback({ ok: true });
    });

    await openExtensionOptionsPage();
    expect(JSON.stringify(sendMessage.mock.calls)).not.toContain("chrome-extension://");
  });
});
