export type OptionsNavigationResult = {
  ok: boolean;
  error?: string;
};

export function openExtensionOptionsPage(): Promise<OptionsNavigationResult> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" }, (response: OptionsNavigationResult | undefined) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve({
            ok: false,
            error: lastError.message || "Options page could not be opened."
          });
          return;
        }

        resolve(response ?? { ok: false, error: "Options page could not be opened." });
      });
    } catch (error) {
      resolve({
        ok: false,
        error: error instanceof Error && error.message ? error.message : "Options page could not be opened."
      });
    }
  });
}
