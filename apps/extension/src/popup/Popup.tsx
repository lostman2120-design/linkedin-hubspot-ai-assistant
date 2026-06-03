import { useEffect, useState } from "react";
import type { UserSettings } from "@linkedin-hubspot-ai/shared";
import { DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import { apiRequest } from "../apiClient";
import { getStoredSettings, getTodayUsageCount } from "../storage";
import "../pages.css";

type ConnectionStatus = "checking" | "connected" | "not_connected";

export function Popup() {
  const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_USER_SETTINGS });
  const [apiStatus, setApiStatus] = useState<ConnectionStatus>("checking");
  const [hubSpotConnected, setHubSpotConnected] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const loadedSettings = await getStoredSettings();
        setSettings(loadedSettings);
        setUsageCount(await getTodayUsageCount());
        await apiRequest<{ ok: true }>("/health", { method: "GET", trackUsage: false });
        setApiStatus("connected");
        const hubSpotStatus = await apiRequest<{ configured: boolean }>("/hubspot/status", {
          method: "GET",
          trackUsage: false
        });
        setHubSpotConnected(hubSpotStatus.configured);
      } catch (loadError) {
        setApiStatus("not_connected");
        setError(loadError instanceof Error ? loadError.message : "Could not check the backend API.");
      }
    }

    void load();
  }, []);

  return (
    <main className="page popup">
      <h1 className="title">LinkedIn to HubSpot AI Assistant</h1>
      <p className="subtitle">Use the sidebar on a LinkedIn profile page.</p>

      <div className="rows">
        <div className="row">
          <strong>Connection status</strong>
          <span className={apiStatus === "connected" ? "status-ok" : "status-bad"}>
            {apiStatus === "checking" ? "Checking" : apiStatus === "connected" ? "Connected" : "Not connected"}
          </span>
        </div>
        <div className="row">
          <strong>Backend API URL</strong>
          <span>{settings.backendApiUrl}</span>
        </div>
        <div className="row">
          <strong>HubSpot status</strong>
          <span className={hubSpotConnected ? "status-ok" : "status-bad"}>{hubSpotConnected ? "Configured" : "Not configured"}</span>
        </div>
        <div className="row">
          <strong>Today's usage count</strong>
          <span>{usageCount}</span>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="button-row">
        <button className="button" type="button" onClick={() => chrome.runtime.openOptionsPage()}>
          Open Options
        </button>
      </div>
    </main>
  );
}
