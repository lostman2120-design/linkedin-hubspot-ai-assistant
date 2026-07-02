import { FormEvent, useEffect, useState } from "react";
import type { SellerContext, UserSettings } from "@linkedin-hubspot-ai/shared";
import { DEFAULT_USER_SETTINGS, DM_TONES, SELLER_CONTEXT_FIELD_LIMITS, UserSettingsSchema } from "@linkedin-hubspot-ai/shared";
import {
  activateLicenseKey,
  removeLicenseKey,
  statusMessageForLicenseState,
  type LicenseStatusMessage
} from "../licenseActivation";
import { LICENSE_STATE_KEY, getStoredLicenseState, getStoredSettings, saveStoredSettings } from "../storage";
import { isBetaProLicenseActive, planLabel } from "../plan";
import {
  SELLER_CONTEXT_TEMPLATES,
  getSellerContextTemplate,
  sellerContextHasValues,
  type SellerContextTemplateId
} from "../sellerContextTemplates";
import "../pages.css";

type SellerContextField = {
  key: keyof SellerContext;
  label: string;
  multiline?: boolean;
};

const sellerContextFields: SellerContextField[] = [
  { key: "productOrServiceName", label: "Product or service name" },
  { key: "productOrServiceDescription", label: "Product or service description", multiline: true },
  { key: "targetOutcome", label: "Target outcome", multiline: true },
  { key: "mainDifferentiators", label: "Main differentiators", multiline: true },
  { key: "proofPoints", label: "Proof points", multiline: true },
  { key: "pricingContext", label: "Pricing or pricing context" },
  { key: "preferredCta", label: "Preferred CTA" },
  { key: "claimsAllowed", label: "Claims allowed", multiline: true },
  { key: "claimsToAvoid", label: "Claims to avoid", multiline: true },
  { key: "brandVoice", label: "Brand voice", multiline: true },
  { key: "competitorsOrAlternatives", label: "Competitors or existing alternatives", multiline: true },
  { key: "compatibilityContext", label: "Compatibility or coexistence context", multiline: true }
];

export function Options() {
  const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_USER_SETTINGS });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusMessage | null>(null);
  const [isLicenseBusy, setIsLicenseBusy] = useState(false);
  const [isBetaProActive, setIsBetaProActive] = useState(false);
  const [licensePlanLabel, setLicensePlanLabel] = useState<"Free plan" | "Beta Pro" | "Pro">("Free plan");
  const [selectedTemplateId, setSelectedTemplateId] = useState<SellerContextTemplateId | "">("");

  useEffect(() => {
    void getStoredSettings().then(setSettings).catch(() => {
      setError("Settings could not be loaded. Please save them again.");
    });

    void getStoredLicenseState().then((storedLicense) => {
      setLicenseKey(storedLicense.licenseKey ?? "");
      setLicenseStatus(statusMessageForLicenseState(storedLicense));
      setIsBetaProActive(isBetaProLicenseActive(storedLicense));
      setLicensePlanLabel(planLabel(storedLicense));
    });
  }, []);

  useEffect(() => {
    const handleStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "local" && changes[LICENSE_STATE_KEY]) {
        void refreshLicenseState();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    };
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
    setIsLicenseBusy(true);
    setLicenseStatus(null);
    setMessage(null);
    setError(null);

    try {
      const result = await activateLicenseKey(licenseKey);
      setLicenseKey(result.licenseState.licenseKey ?? licenseKey);
      setLicenseStatus(result.statusMessage);
      setIsBetaProActive(isBetaProLicenseActive(result.licenseState));
      setLicensePlanLabel(planLabel(result.licenseState));
      let refreshFailed = false;
      await refreshLicenseState().catch(() => {
        refreshFailed = true;
      });

      if (isBetaProLicenseActive(result.licenseState)) {
        setMessage(refreshFailed ? "License activated. If the plan does not update, please close and reopen the extension popup." : "License active.");
      }
    } finally {
      setIsLicenseBusy(false);
    }
  }

  async function handleRemoveLicense() {
    setIsLicenseBusy(true);

    try {
      await removeLicenseKey();
      setLicenseKey("");
      setLicenseStatus(null);
      setIsBetaProActive(false);
      setLicensePlanLabel("Free plan");
    } finally {
      setIsLicenseBusy(false);
    }
  }

  async function refreshLicenseState() {
    const storedLicense = await getStoredLicenseState();
    setLicenseKey(storedLicense.licenseKey ?? "");
    setLicenseStatus(statusMessageForLicenseState(storedLicense));
    setIsBetaProActive(isBetaProLicenseActive(storedLicense));
    setLicensePlanLabel(planLabel(storedLicense));
  }

  function updateSellerContext(key: keyof SellerContext, value: string) {
    setSettings({
      ...settings,
      sellerContext: {
        ...settings.sellerContext,
        [key]: value
      }
    });
  }

  function handleApplyTemplate() {
    if (!selectedTemplateId) {
      return;
    }

    const template = getSellerContextTemplate(selectedTemplateId);
    if (
      sellerContextHasValues(settings.sellerContext) &&
      !window.confirm(`Replace your current Seller Context with the ${template.name} template?`)
    ) {
      return;
    }

    setSettings({
      ...settings,
      productOrServiceDescription: template.context.productOrServiceDescription,
      sellerContext: { ...template.context }
    });
    setError(null);
    setMessage(`${template.name} template applied. Review the fields, then save your settings.`);
  }

  return (
    <main className="page">
      <h1 className="title">Settings</h1>
      <p className="subtitle">Analyze a LinkedIn profile, review ICP fit and recommended action, then save the sales context to HubSpot.</p>
      <section className="panel intro-panel">
        <h2 className="panel-title">Stop saving empty LinkedIn leads. Save why they matter.</h2>
        <p className="subtitle">Start with a template, then adjust your ICP and Seller Context so the assistant can make a useful sales decision.</p>
      </section>

      <form className="form" onSubmit={(event) => void handleSubmit(event)}>
        <section className="panel template-panel">
          <h2 className="panel-title">Start with a template</h2>
          <p className="subtitle">Choose the closest sales motion. Applying a template fills Seller Context but does not save until you click Save Settings.</p>
          <div className="field">
            <label htmlFor="sellerContextTemplate">Seller Context template</label>
            <select
              id="sellerContextTemplate"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value as SellerContextTemplateId | "")}
            >
              <option value="" disabled>
                Select a starter template...
              </option>
              {SELLER_CONTEXT_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <span className="field-help">
              {selectedTemplateId
                ? getSellerContextTemplate(selectedTemplateId).description
                : "Templates are optional and only fill the form after you choose and apply one."}
            </span>
          </div>
          <button className="button secondary" type="button" disabled={!selectedTemplateId} onClick={handleApplyTemplate}>
            Apply template
          </button>
        </section>

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

        <section className="panel">
          <h2 className="panel-title">ICP Settings</h2>
          <p className="subtitle">These help the AI score profiles against your best-fit customers.</p>

          <div className="field">
            <label htmlFor="targetIndustries">Target industries</label>
            <textarea
              id="targetIndustries"
              value={settings.targetIndustries}
              onChange={(event) => setSettings({ ...settings, targetIndustries: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="targetRoles">Target roles or titles</label>
            <textarea
              id="targetRoles"
              value={settings.targetRoles}
              onChange={(event) => setSettings({ ...settings, targetRoles: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="targetCompanySize">Target company size</label>
            <input
              id="targetCompanySize"
              type="text"
              value={settings.targetCompanySize}
              onChange={(event) => setSettings({ ...settings, targetCompanySize: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="targetRegion">Target region</label>
            <input
              id="targetRegion"
              type="text"
              value={settings.targetRegion}
              onChange={(event) => setSettings({ ...settings, targetRegion: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="mainPainPointsSolved">Main pain points you solve</label>
            <textarea
              id="mainPainPointsSolved"
              value={settings.mainPainPointsSolved}
              onChange={(event) => setSettings({ ...settings, mainPainPointsSolved: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="excludedRoles">Excluded roles or types</label>
            <textarea
              id="excludedRoles"
              value={settings.excludedRoles}
              onChange={(event) => setSettings({ ...settings, excludedRoles: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="preferredOutreachTone">Preferred outreach tone</label>
            <input
              id="preferredOutreachTone"
              type="text"
              value={settings.preferredOutreachTone}
              onChange={(event) => setSettings({ ...settings, preferredOutreachTone: event.target.value })}
            />
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Seller Context</h2>
          <p className="subtitle">Tell the assistant what you sell so scoring and DM drafts can use the right commercial context.</p>

          {sellerContextFields.map((field) => {
            const value = settings.sellerContext[field.key] ?? "";
            const maxLength = SELLER_CONTEXT_FIELD_LIMITS[field.key];
            const fieldId = `sellerContext-${field.key}`;

            return (
              <div className="field" key={field.key}>
                <label htmlFor={fieldId}>{field.label}</label>
                {field.multiline ? (
                  <textarea
                    id={fieldId}
                    maxLength={maxLength}
                    value={value}
                    onChange={(event) => updateSellerContext(field.key, event.target.value)}
                  />
                ) : (
                  <input
                    id={fieldId}
                    type="text"
                    maxLength={maxLength}
                    value={value}
                    onChange={(event) => updateSellerContext(field.key, event.target.value)}
                  />
                )}
                <span className="field-counter">
                  {Array.from(value).length} / {maxLength}
                </span>
              </div>
            );
          })}
        </section>

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
        <p className="subtitle">{isBetaProActive ? `${licensePlanLabel} active` : licensePlanLabel}</p>
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
          <button className="button" type="button" disabled={isLicenseBusy} onClick={() => void handleActivateLicense()}>
            {isLicenseBusy ? "Activating..." : "Activate license"}
          </button>
          <button className="button secondary" type="button" disabled={isLicenseBusy} onClick={() => void handleRemoveLicense()}>
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
