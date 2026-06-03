import { FormEvent, useEffect, useState } from "react";
import type { UserSettings } from "@linkedin-hubspot-ai/shared";
import { DEFAULT_USER_SETTINGS, DM_TONES, UserSettingsSchema } from "@linkedin-hubspot-ai/shared";
import {
  activateLicenseKey,
  removeLicenseKey,
  statusMessageForLicenseState,
  type LicenseStatusMessage
} from "../licenseActivation";
import { getStoredLicenseState, getStoredSettings, saveStoredSettings } from "../storage";
import "../pages.css";

export function Options() {
  const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_USER_SETTINGS });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusMessage | null>(null);

  useEffect(() => {
    void getStoredSettings().then(setSettings).catch(() => {
      setError("Settings could not be loaded. Please save them again.");
    });

    void getStoredLicenseState().then((storedLicense) => {
      setLicenseKey(storedLicense.licenseKey ?? "");
      setLicenseStatus(statusMessageForLicenseState(storedLicense));
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const parsed = UserSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }

    try {
      await saveStoredSettings(parsed.data);
      setSettings(parsed.data);
      setMessage("Settings saved.");
    } catch {
      setError("Settings could not be saved. Please try again.");
    }
  }

  async function handleActivateLicense() {
    setLicenseStatus(null);
    const result = await activateLicenseKey(licenseKey);
    setLicenseKey(result.licenseState.licenseKey ?? licenseKey);
    setLicenseStatus(result.statusMessage);
  }

  async function handleRemoveLicense() {
    await removeLicenseKey();
    setLicenseKey("");
    setLicenseStatus(null);
  }

  return (
    <main className="page">
      <h1 className="title">Settings</h1>
      <p className="subtitle">These settings help the AI write useful, respectful outreach messages.</p>

      <form className="form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="field">
          <label htmlFor="backendApiUrl">Backend API URL</label>
          <input
            id="backendApiUrl"
            type="url"
            value={settings.backendApiUrl}
            onChange={(event) => setSettings({ ...settings, backendApiUrl: event.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="productOrServiceDescription">Your product or service</label>
          <textarea
            id="productOrServiceDescription"
            value={settings.productOrServiceDescription}
            onChange={(event) => setSettings({ ...settings, productOrServiceDescription: event.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="targetCustomerProfile">Target customer profile</label>
          <textarea
            id="targetCustomerProfile"
            value={settings.targetCustomerProfile}
            onChange={(event) => setSettings({ ...settings, targetCustomerProfile: event.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="dmTone">DM tone</label>
          <select
            id="dmTone"
            value={settings.dmTone}
            onChange={(event) => setSettings({ ...settings, dmTone: event.target.value as UserSettings["dmTone"] })}
          >
            {DM_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {tone}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="defaultHubSpotLifecycleStage">Default HubSpot lifecycle stage</label>
          <input
            id="defaultHubSpotLifecycleStage"
            type="text"
            value={settings.defaultHubSpotLifecycleStage}
            onChange={(event) => setSettings({ ...settings, defaultHubSpotLifecycleStage: event.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="defaultFollowUpDays">Default days before follow-up task</label>
          <input
            id="defaultFollowUpDays"
            type="number"
            min="1"
            max="60"
            value={settings.defaultFollowUpDays}
            onChange={(event) => setSettings({ ...settings, defaultFollowUpDays: Number(event.target.value) })}
          />
        </div>

        <div className="button-row">
          <button className="button" type="submit">
            Save Settings
          </button>
          {message ? <span className="message">{message}</span> : null}
          {error ? <span className="message error">{error}</span> : null}
        </div>
      </form>

      <section className="panel">
        <h2 className="panel-title">License</h2>
        <p className="subtitle">Activate Beta Pro to unlock all outreach and HubSpot actions.</p>
        <div className="field">
          <label htmlFor="licenseKey">License key</label>
          <input
            id="licenseKey"
            type="password"
            autoComplete="off"
            value={licenseKey}
            onChange={(event) => setLicenseKey(event.target.value)}
          />
        </div>
        <div className="button-row">
          <button className="button" type="button" onClick={() => void handleActivateLicense()}>
            Activate license
          </button>
          <button className="button secondary" type="button" onClick={() => void handleRemoveLicense()}>
            Remove license
          </button>
          {licenseStatus ? (
            <span className={licenseStatus === "License active" ? "message" : "message error"}>{licenseStatus}</span>
          ) : null}
        </div>
      </section>
    </main>
  );
}
