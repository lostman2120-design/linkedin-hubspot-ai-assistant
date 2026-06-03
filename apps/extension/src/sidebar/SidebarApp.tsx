import { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedDm, HubSpotSyncResult, LinkedInProfile, MessageType, ProfileAnalysis, UserSettings } from "@linkedin-hubspot-ai/shared";
import { DEFAULT_USER_SETTINGS, UNABLE_TO_EXTRACT_FIELD } from "@linkedin-hubspot-ai/shared";
import { apiRequest } from "../apiClient";
import { STRIPE_PAYMENT_LINK } from "../billing";
import {
  activateLicenseKey,
  removeLicenseKey,
  statusMessageForLicenseState,
  type LicenseStatusMessage
} from "../licenseActivation";
import { extractLinkedInProfile, getCurrentLinkedInProfileUrl, isLinkedInProfilePage } from "../linkedinProfileExtractor";
import { getPlanAccess, isBetaProLicenseActive, isFeatureLockedForFree, planLabel, type PlanFeature } from "../plan";
import {
  DAILY_USAGE_KEY,
  DEFAULT_LICENSE_STATE,
  FREE_PLAN_LIMITS,
  LICENSE_STATE_KEY,
  getDailyUsage,
  getStoredLicenseState,
  getStoredSettings,
  incrementDailyUsage,
  type DailyUsage,
  type StoredLicenseState
} from "../storage";
import { PROFILE_URL_CHANGED_EVENT } from "../urlEvents";
import {
  DEFAULT_CRM_STATUS,
  DEFAULT_NEXT_ACTION,
  DM_PLACEHOLDER,
  SCORING_SETTINGS_WARNING,
  getSyncStateForAnalyzedProfile,
  hasLeadScoringSettings,
  localActionStatusForHubSpotSync,
  type LocalActionStatus
} from "./sidebarState";

type SidebarStatus = "idle" | "analyzing" | "analysis_complete" | "generating_dm" | "syncing_hubspot" | "success" | "error";

function statusLabel(status: SidebarStatus): string {
  const labels: Record<SidebarStatus, string> = {
    idle: "Idle",
    analyzing: "Analyzing",
    analysis_complete: "Analysis complete",
    generating_dm: "Generating DM",
    syncing_hubspot: "Syncing with HubSpot",
    success: "Success",
    error: "Error"
  };

  return labels[status];
}

function friendlyError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function sectionValue(value: string | undefined, placeholder: string): string {
  return value && value.trim().length > 0 && value !== UNABLE_TO_EXTRACT_FIELD ? value : placeholder;
}

function scoreBand(score: number | undefined): string {
  if (typeof score !== "number") {
    return "Not analyzed";
  }

  if (score >= 80) {
    return "Strong fit";
  }

  if (score >= 60) {
    return "Good fit";
  }

  if (score >= 40) {
    return "Possible fit";
  }

  if (score >= 15) {
    return "Weak fit";
  }

  return "Poor fit";
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function UpgradeCallout() {
  return (
    <div className="lhai-upgrade-callout">
      <h3>Upgrade to Beta Pro</h3>
      <p>Unlock unlimited profile analysis, outreach drafts, HubSpot contact sync, AI summary notes, and follow-up tasks.</p>
      <strong>$19/month</strong>
      <a href={STRIPE_PAYMENT_LINK} target="_blank" rel="noreferrer">
        Upgrade
      </a>
    </div>
  );
}

export function SidebarApp() {
  const [status, setStatus] = useState<SidebarStatus>("idle");
  const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_USER_SETTINGS });
  const [licenseState, setLicenseState] = useState<StoredLicenseState>({ ...DEFAULT_LICENSE_STATE });
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusMessage | null>(null);
  const [isLicenseBusy, setIsLicenseBusy] = useState(false);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ date: "", profileAnalyses: 0, outreachDrafts: 0 });
  const [profile, setProfile] = useState<LinkedInProfile | null>(null);
  const [analysis, setAnalysis] = useState<ProfileAnalysis | null>(null);
  const [generatedDm, setGeneratedDm] = useState<GeneratedDm | null>(null);
  const [generatedDmProfileUrl, setGeneratedDmProfileUrl] = useState<string | null>(null);
  const [, setSelectedMessageType] = useState<MessageType | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [syncedProfileUrl, setSyncedProfileUrl] = useState<string | null>(null);
  const [crmStatus, setCrmStatus] = useState(DEFAULT_CRM_STATUS);
  const [, setNoteStatus] = useState<string | null>(null);
  const [, setTaskStatus] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState(DEFAULT_NEXT_ACTION);
  const [message, setMessage] = useState<string | null>(null);
  const [localActionStatus, setLocalActionStatus] = useState<LocalActionStatus | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [lastAnalyzedProfileUrl, setLastAnalyzedProfileUrl] = useState<string | null>(null);
  const activeProfileUrlRef = useRef<string | null>(null);
  const analysisRequestIdRef = useRef(0);
  const dmRequestIdRef = useRef(0);

  const isBusy = useMemo(() => ["analyzing", "generating_dm", "syncing_hubspot"].includes(status), [status]);
  const isBetaPro = isBetaProLicenseActive(licenseState);
  const currentPlanLabel = planLabel(licenseState);
  const visibleGeneratedDm = generatedDmProfileUrl === lastAnalyzedProfileUrl ? generatedDm : null;
  const leadScoreDisplay = analysis ? (analysis.confidence === "low" ? "Fit: Unknown" : String(analysis.leadScore)) : "--";
  const showScoringSettingsWarning = !hasLeadScoringSettings(settings);
  const analyzeButtonLabel = status === "analyzing" ? "Analyzing..." : "Analyze Profile";
  const isGeneratingDm = status === "generating_dm";
  const isSyncingHubSpot = status === "syncing_hubspot";
  const analyzeAccess = getPlanAccess({ feature: "analyze_profile", licenseState, usage: dailyUsage });
  const firstDmAccess = getPlanAccess({ feature: "first_dm", licenseState, usage: dailyUsage });
  const isAnalyzeBlockedByPlan = !analyzeAccess.allowed;
  const isFirstDmBlockedByPlan = !firstDmAccess.allowed;
  const isConnectionMessageLocked = isFeatureLockedForFree("connection_message", licenseState);
  const isFollowUpLocked = isFeatureLockedForFree("follow_up", licenseState);
  const areHubSpotActionsLocked = !isBetaPro;

  useEffect(() => {
    void getStoredSettings().then(setSettings).catch(() => {
      setMessage("Settings could not be loaded. Open Options and save your settings again.");
      setStatus("error");
    });

    void refreshPlanState(true);
  }, []);

  useEffect(() => {
    const handleStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "local" && (changes[LICENSE_STATE_KEY] || changes[DAILY_USAGE_KEY])) {
        void refreshPlanState(Boolean(changes[LICENSE_STATE_KEY]));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    };
  }, []);

  useEffect(() => {
    function handleProfileUrlChanged() {
      const nextProfileUrl = isLinkedInProfilePage() ? getCurrentLinkedInProfileUrl() : null;
      if (activeProfileUrlRef.current && activeProfileUrlRef.current !== nextProfileUrl) {
        resetAllProfileSpecificState(nextProfileUrl);
        setMessage("Profile changed. Previous message cleared.");
      }
    }

    window.addEventListener(PROFILE_URL_CHANGED_EVENT, handleProfileUrlChanged);
    window.addEventListener("popstate", handleProfileUrlChanged);

    return () => {
      window.removeEventListener(PROFILE_URL_CHANGED_EVENT, handleProfileUrlChanged);
      window.removeEventListener("popstate", handleProfileUrlChanged);
    };
  }, []);

  async function refreshPlanState(syncLicenseInput = false) {
    const [storedLicenseState, storedDailyUsage] = await Promise.all([getStoredLicenseState(), getDailyUsage()]);
    setLicenseState(storedLicenseState);
    setDailyUsage(storedDailyUsage);

    if (syncLicenseInput) {
      setLicenseKeyInput(storedLicenseState.licenseKey ?? "");
      setLicenseStatus(statusMessageForLicenseState(storedLicenseState));
    }

    if (isBetaProLicenseActive(storedLicenseState)) {
      setUpgradeMessage(null);
    }
  }

  function featureForMessageType(messageType: MessageType): PlanFeature {
    if (messageType === "connection") {
      return "connection_message";
    }

    if (messageType === "follow_up") {
      return "follow_up";
    }

    return "first_dm";
  }

  function ensurePlanAccess(feature: PlanFeature, resultPlacement: "top" | "bottom" = "top"): boolean {
    const access = getPlanAccess({ feature, licenseState, usage: dailyUsage });
    if (access.allowed) {
      return true;
    }

    const blockedMessage = access.message ?? "Available in Beta Pro";
    setUpgradeMessage(blockedMessage);
    setStatus("error");

    if (resultPlacement === "bottom") {
      setMessage(blockedMessage);
      setLocalActionStatus({ type: "error", message: blockedMessage });
    } else {
      setLocalActionStatus(null);
      setMessage(blockedMessage);
    }

    return false;
  }

  function lockedButtonContent(label: string, locked: boolean) {
    return locked ? (
      <>
        <span className="lhai-lock-icon" aria-hidden="true" />
        {label}
      </>
    ) : (
      label
    );
  }

  async function handleActivateLicense() {
    setIsLicenseBusy(true);
    setLicenseStatus(null);

    try {
      const result = await activateLicenseKey(licenseKeyInput);
      setLicenseState(result.licenseState);
      setLicenseKeyInput(result.licenseState.licenseKey ?? licenseKeyInput);
      setLicenseStatus(result.statusMessage);

      if (isBetaProLicenseActive(result.licenseState)) {
        setStatus("success");
        setMessage("License active");
        setUpgradeMessage(null);
        setLocalActionStatus(null);
        return;
      }

      setStatus("error");
      setMessage(result.statusMessage ?? "Invalid license");
    } finally {
      setIsLicenseBusy(false);
    }
  }

  async function handleRemoveLicense() {
    setIsLicenseBusy(true);

    try {
      const result = await removeLicenseKey();
      setLicenseState(result.licenseState);
      setLicenseKeyInput("");
      setLicenseStatus(null);
      setUpgradeMessage(null);
      setStatus("idle");
      setMessage("License removed. Free plan active.");
      setLocalActionStatus(null);
    } finally {
      setIsLicenseBusy(false);
    }
  }

  function resetAllProfileSpecificState(nextProfileUrl: string | null) {
    analysisRequestIdRef.current += 1;
    dmRequestIdRef.current += 1;
    activeProfileUrlRef.current = nextProfileUrl;
    setLastAnalyzedProfileUrl(nextProfileUrl);
    setProfile(null);
    setAnalysis(null);
    setGeneratedDm(null);
    setGeneratedDmProfileUrl(null);
    setSelectedMessageType(null);
    setContactId(null);
    setSyncedProfileUrl(null);
    setCrmStatus(DEFAULT_CRM_STATUS);
    setNoteStatus(null);
    setTaskStatus(null);
    setMessage(null);
    setLocalActionStatus(null);
    setUpgradeMessage(null);
    setStatus("idle");
    setNextAction(DEFAULT_NEXT_ACTION);
  }

  async function analyzeProfile() {
    if (!ensurePlanAccess("analyze_profile")) {
      return;
    }

    try {
      const extractedProfile = extractLinkedInProfile();
      const profileUrl = extractedProfile.profileUrl;
      const requestId = analysisRequestIdRef.current + 1;
      analysisRequestIdRef.current = requestId;
      dmRequestIdRef.current += 1;
      activeProfileUrlRef.current = profileUrl;
      setLastAnalyzedProfileUrl(profileUrl);
      const syncState = getSyncStateForAnalyzedProfile({
        nextProfileUrl: profileUrl,
        contactId,
        crmStatus,
        syncedProfileUrl
      });

      setProfile(extractedProfile);
      setAnalysis(null);
      setGeneratedDm(null);
      setGeneratedDmProfileUrl(null);
      setSelectedMessageType(null);
      setNoteStatus(null);
      setTaskStatus(null);
      setLocalActionStatus(null);
      setUpgradeMessage(null);
      setContactId(syncState.contactId);
      setCrmStatus(syncState.crmStatus);
      setSyncedProfileUrl(syncState.syncedProfileUrl);
      setStatus("analyzing");
      setMessage(null);
      setNextAction("The AI is reviewing the visible profile information.");

      const result = await apiRequest<ProfileAnalysis>("/ai/analyze-profile", {
        method: "POST",
        body: { profile: extractedProfile, userSettings: settings }
      });

      if (activeProfileUrlRef.current !== profileUrl || analysisRequestIdRef.current !== requestId) {
        return;
      }

      setAnalysis(result);
      setStatus("analysis_complete");
      setNextAction(result.recommendedAction);
      setMessage("Profile analysis is ready.");

      if (!isBetaProLicenseActive(licenseState)) {
        setDailyUsage(await incrementDailyUsage("profileAnalyses"));
      }
    } catch (error) {
      setStatus("error");
      setMessage(friendlyError(error));
    }
  }

  async function generateDm(messageType: MessageType) {
    if (!ensurePlanAccess(featureForMessageType(messageType))) {
      return;
    }

    if (!profile || !analysis) {
      setStatus("error");
      setMessage("Analyze the profile before generating a message.");
      return;
    }

    try {
      const profileUrl = profile.profileUrl;
      const requestId = dmRequestIdRef.current + 1;
      dmRequestIdRef.current = requestId;
      setSelectedMessageType(messageType);
      setStatus("generating_dm");
      setMessage(null);
      setLocalActionStatus(null);
      setUpgradeMessage(null);
      setGeneratedDm(null);
      setGeneratedDmProfileUrl(null);
      setNextAction("The AI is drafting a short message for manual review.");

      const result = await apiRequest<GeneratedDm>("/ai/generate-dm", {
        method: "POST",
        body: { profile, analysis, messageType, userSettings: settings }
      });

      if (activeProfileUrlRef.current !== profileUrl || dmRequestIdRef.current !== requestId) {
        return;
      }

      setGeneratedDm(result);
      setGeneratedDmProfileUrl(profileUrl);
      setStatus("success");
      setNextAction("Review the message, copy it, and send it manually if it feels right.");
      setMessage("Message generated. Please review it before sending.");

      if (messageType === "first_dm" && !isBetaProLicenseActive(licenseState)) {
        setDailyUsage(await incrementDailyUsage("outreachDrafts"));
      }
    } catch (error) {
      setStatus("error");
      setMessage(friendlyError(error));
    }
  }

  async function copyDm() {
    if (!visibleGeneratedDm?.message) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "There is no message to copy yet." });
      return;
    }

    try {
      await copyText(visibleGeneratedDm.message);
      setStatus("success");
      setLocalActionStatus({ type: "success", message: "DM copied." });
    } catch {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "The message could not be copied. Please select the text and copy it manually." });
    }
  }

  async function addToHubSpot() {
    if (!ensurePlanAccess("add_to_hubspot", "bottom")) {
      return;
    }

    if (!profile || !analysis) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "Analyze the profile before adding it to HubSpot." });
      return;
    }

    try {
      setStatus("syncing_hubspot");
      setMessage(null);
      setLocalActionStatus(null);
      setUpgradeMessage(null);
      setCrmStatus("Syncing");

      const result = await apiRequest<HubSpotSyncResult>("/hubspot/upsert-contact", {
        method: "POST",
        body: { profile, analysis, userSettings: settings }
      });

      setContactId(result.contactId);
      setSyncedProfileUrl(profile.profileUrl);
      setCrmStatus(result.created ? "Created in HubSpot" : "Updated in HubSpot");
      setStatus("success");
      setLocalActionStatus(localActionStatusForHubSpotSync(result.created));
    } catch (error) {
      setCrmStatus("Sync failed");
      setStatus("error");
      setLocalActionStatus({ type: "error", message: friendlyError(error) });
    }
  }

  async function createHubSpotNote() {
    if (!ensurePlanAccess("create_hubspot_note", "bottom")) {
      return;
    }

    if (!profile || !analysis || !contactId) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "Add or update the contact in HubSpot before creating a note." });
      return;
    }

    try {
      setStatus("syncing_hubspot");
      setMessage(null);
      setLocalActionStatus(null);
      setUpgradeMessage(null);
      await apiRequest<{ noteId: string }>("/hubspot/create-note", {
        method: "POST",
        body: { contactId, profile, analysis, dmMessage: visibleGeneratedDm?.message }
      });
      setNoteStatus("created");
      setStatus("success");
      setLocalActionStatus({ type: "success", message: "HubSpot note created." });
    } catch (error) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: friendlyError(error) });
    }
  }

  async function createFollowUpTask() {
    if (!ensurePlanAccess("create_follow_up_task", "bottom")) {
      return;
    }

    if (!contactId) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "Add or update the contact in HubSpot before creating a follow-up task." });
      return;
    }

    try {
      setStatus("syncing_hubspot");
      setMessage(null);
      setLocalActionStatus(null);
      setUpgradeMessage(null);
      await apiRequest<{ taskId: string; fallback: string }>("/hubspot/create-task", {
        method: "POST",
        body: {
          contactId,
          daysFromNow: settings.defaultFollowUpDays,
          taskTitle: "Follow up from LinkedIn profile review",
          taskBody: visibleGeneratedDm?.message
            ? `Follow up based on the generated LinkedIn message:\n\n${visibleGeneratedDm.message}`
            : "Follow up based on the LinkedIn profile analysis."
        }
      });
      setTaskStatus("created");
      setStatus("success");
      setLocalActionStatus({ type: "success", message: "Follow-up task created." });
    } catch (error) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: friendlyError(error) });
    }
  }

  return (
    <aside className="lhai-shell" aria-label="LinkedIn to HubSpot AI Assistant">
      <header className="lhai-header">
        <div>
          <h2 className="lhai-title">LinkedIn to HubSpot AI Assistant</h2>
          <p className="lhai-subtitle">AI research, outreach, and CRM updates</p>
        </div>
        <div className="lhai-header-badges">
          <span className={`lhai-plan-badge ${isBetaPro ? "lhai-plan-badge-pro" : "lhai-plan-badge-free"}`}>{currentPlanLabel}</span>
          {isBetaPro ? <span className="lhai-pro-active">Beta Pro active</span> : null}
          <span className={`lhai-status lhai-status-${status}`}>
            <span className="lhai-status-dot" />
            {statusLabel(status)}
          </span>
        </div>
      </header>

      <div className="lhai-body">
        <section className="lhai-section lhai-card lhai-hero-card">
          {!isBetaPro ? (
            <div className="lhai-usage-panel" aria-label="Free plan usage">
              <span>
                Profile analyses: {dailyUsage.profileAnalyses} / {FREE_PLAN_LIMITS.profileAnalyses} today
              </span>
              <span>
                Outreach drafts: {dailyUsage.outreachDrafts} / {FREE_PLAN_LIMITS.outreachDrafts} today
              </span>
            </div>
          ) : null}
          <div className="lhai-actions">
            <button
              className={`lhai-button lhai-button-primary${status === "analyzing" ? " lhai-button-loading" : ""}${
                isAnalyzeBlockedByPlan ? " lhai-button-locked" : ""
              }`}
              type="button"
              disabled={isBusy}
              aria-disabled={isAnalyzeBlockedByPlan}
              aria-busy={status === "analyzing"}
              title={isAnalyzeBlockedByPlan ? analyzeAccess.message : undefined}
              onClick={analyzeProfile}
            >
              {lockedButtonContent(analyzeButtonLabel, isAnalyzeBlockedByPlan)}
            </button>
            <button
              className={`lhai-button${isGeneratingDm ? " lhai-button-loading" : ""}${
                isConnectionMessageLocked ? " lhai-button-locked" : ""
              }`}
              type="button"
              disabled={isBusy || (!isConnectionMessageLocked && !analysis)}
              aria-disabled={isConnectionMessageLocked}
              aria-busy={isGeneratingDm}
              title={isConnectionMessageLocked ? "Available in Beta Pro" : undefined}
              onClick={() => void generateDm("connection")}
            >
              {lockedButtonContent("Connection Message", isConnectionMessageLocked)}
            </button>
            <button
              className={`lhai-button${isGeneratingDm ? " lhai-button-loading" : ""}${
                isFirstDmBlockedByPlan ? " lhai-button-locked" : ""
              }`}
              type="button"
              disabled={isBusy || (!isFirstDmBlockedByPlan && !analysis)}
              aria-disabled={isFirstDmBlockedByPlan}
              aria-busy={isGeneratingDm}
              title={isFirstDmBlockedByPlan ? firstDmAccess.message : undefined}
              onClick={() => void generateDm("first_dm")}
            >
              {lockedButtonContent("First DM", isFirstDmBlockedByPlan)}
            </button>
            <button
              className={`lhai-button${isGeneratingDm ? " lhai-button-loading" : ""}${isFollowUpLocked ? " lhai-button-locked" : ""}`}
              type="button"
              disabled={isBusy || (!isFollowUpLocked && !analysis)}
              aria-disabled={isFollowUpLocked}
              aria-busy={isGeneratingDm}
              title={isFollowUpLocked ? "Available in Beta Pro" : undefined}
              onClick={() => void generateDm("follow_up")}
            >
              {lockedButtonContent("Follow-up", isFollowUpLocked)}
            </button>
          </div>
          {message ? <div className={`lhai-alert lhai-alert-${status === "error" ? "error" : "success"}`}>{message}</div> : null}
          {!isBetaPro ? <UpgradeCallout /> : null}
          <div className="lhai-license-panel" aria-label="License activation">
            <div className="lhai-section-heading">
              <span className="lhai-label">License</span>
              {isBetaPro ? <span className="lhai-pill lhai-pill-success">Beta Pro active</span> : null}
            </div>
            <label className="lhai-license-label" htmlFor="lhai-license-key">
              License key
            </label>
            <input
              id="lhai-license-key"
              className="lhai-license-input"
              type="password"
              autoComplete="off"
              value={licenseKeyInput}
              onChange={(event) => setLicenseKeyInput(event.target.value)}
              placeholder="Enter your license key"
            />
            <div className="lhai-license-actions">
              <button className="lhai-button lhai-button-primary" type="button" disabled={isLicenseBusy} onClick={() => void handleActivateLicense()}>
                {isLicenseBusy ? "Checking..." : "Activate license"}
              </button>
              <button className="lhai-button" type="button" disabled={isLicenseBusy} onClick={() => void handleRemoveLicense()}>
                Remove license
              </button>
            </div>
            {licenseStatus ? (
              <div className={`lhai-license-status ${licenseStatus === "License active" ? "lhai-license-status-active" : "lhai-license-status-error"}`}>
                {licenseStatus}
              </div>
            ) : null}
          </div>
        </section>

        <section className="lhai-section lhai-card">
          <div className="lhai-section-heading">
            <span className="lhai-label">Profile</span>
            {profile?.profileUrl ? <span className="lhai-pill">Current page</span> : null}
          </div>
          <p className="lhai-profile-name">{sectionValue(profile?.fullName, "No profile analyzed yet.")}</p>
          <p className="lhai-value lhai-muted">{sectionValue(profile?.headline, "Headline will appear after analysis.")}</p>
          <p className="lhai-value">{sectionValue(profile?.companyName, "Company not detected yet.")}</p>
        </section>

        <section className="lhai-section lhai-card">
          <div className="lhai-grid">
            <div className="lhai-metric">
              <span className="lhai-label">Lead Score</span>
              <span className={`lhai-score${analysis?.confidence === "low" ? " lhai-score-unknown" : ""}`}>{leadScoreDisplay}</span>
              <span className="lhai-score-subtext">{analysis?.confidence === "low" ? "Low confidence" : scoreBand(analysis?.leadScore)}</span>
            </div>
            <div className="lhai-metric">
              <span className="lhai-label">CRM Sync Status</span>
              <p className="lhai-value">{crmStatus}</p>
            </div>
          </div>
          {showScoringSettingsWarning ? <div className="lhai-alert lhai-alert-warning">{SCORING_SETTINGS_WARNING}</div> : null}
        </section>

        <section className="lhai-section lhai-card">
          <span className="lhai-label">Persona</span>
          <p className="lhai-value">{analysis?.persona ?? "Analyze this profile to identify the likely buyer persona."}</p>
        </section>

        <section className="lhai-section lhai-card">
          <span className="lhai-label">Pain Points</span>
          {analysis?.painPoints.length ? (
            <ul className="lhai-list">
              {analysis.painPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : (
            <p className="lhai-value lhai-muted">Likely pain points will appear here after analysis.</p>
          )}
        </section>

        <section className="lhai-section lhai-card">
          <span className="lhai-label">Icebreaker</span>
          <p className="lhai-value">{analysis?.icebreaker ?? "A short, profile-based opener will appear here."}</p>
        </section>

        <section className="lhai-section lhai-card lhai-dm-section">
          <div className="lhai-section-heading">
            <span className="lhai-label">Suggested DM</span>
            <button className="lhai-mini-button" type="button" disabled={!visibleGeneratedDm} onClick={() => void copyDm()}>
              Copy
            </button>
          </div>
          <div className={`lhai-dm${visibleGeneratedDm ? "" : " lhai-empty-state"}`}>
            <p className="lhai-value">{visibleGeneratedDm?.message ?? DM_PLACEHOLDER}</p>
          </div>
          {visibleGeneratedDm ? (
            <div className="lhai-dm-meta">
              <span>Personalization {visibleGeneratedDm.personalizationScore}/100</span>
              <span>Spam risk: {visibleGeneratedDm.spamRisk}</span>
            </div>
          ) : null}
          {visibleGeneratedDm?.warnings.length ? (
            <ul className="lhai-list">
              {visibleGeneratedDm.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="lhai-section lhai-card">
          <span className="lhai-label">Next Action</span>
          <p className="lhai-value">{nextAction}</p>
        </section>

        <section className="lhai-section lhai-card lhai-action-card">
          <div className="lhai-actions">
            <button className="lhai-button" type="button" disabled={isBusy || !visibleGeneratedDm} onClick={() => void copyDm()}>
              Copy DM
            </button>
            <button
              className={`lhai-button${isSyncingHubSpot ? " lhai-button-loading" : ""}${areHubSpotActionsLocked ? " lhai-button-locked" : ""}`}
              type="button"
              disabled={isBusy || (!areHubSpotActionsLocked && !analysis)}
              aria-disabled={areHubSpotActionsLocked}
              aria-busy={isSyncingHubSpot}
              title={areHubSpotActionsLocked ? "Available in Beta Pro" : undefined}
              onClick={() => void addToHubSpot()}
            >
              {lockedButtonContent("Add to HubSpot", areHubSpotActionsLocked)}
            </button>
            <button
              className={`lhai-button${isSyncingHubSpot ? " lhai-button-loading" : ""}${areHubSpotActionsLocked ? " lhai-button-locked" : ""}`}
              type="button"
              disabled={isBusy || (!areHubSpotActionsLocked && !contactId)}
              aria-disabled={areHubSpotActionsLocked}
              aria-busy={isSyncingHubSpot}
              title={areHubSpotActionsLocked ? "Available in Beta Pro" : undefined}
              onClick={() => void createHubSpotNote()}
            >
              {lockedButtonContent("Create HubSpot Note", areHubSpotActionsLocked)}
            </button>
            <button
              className={`lhai-button${isSyncingHubSpot ? " lhai-button-loading" : ""}${areHubSpotActionsLocked ? " lhai-button-locked" : ""}`}
              type="button"
              disabled={isBusy || (!areHubSpotActionsLocked && !contactId)}
              aria-disabled={areHubSpotActionsLocked}
              aria-busy={isSyncingHubSpot}
              title={areHubSpotActionsLocked ? "Available in Beta Pro" : undefined}
              onClick={() => void createFollowUpTask()}
            >
              {lockedButtonContent("Create Follow-up Task", areHubSpotActionsLocked)}
            </button>
          </div>
          {localActionStatus ? (
            <div className={`lhai-alert lhai-alert-${localActionStatus.type === "error" ? "error" : "success"}`}>{localActionStatus.message}</div>
          ) : null}
          {upgradeMessage && localActionStatus?.message === upgradeMessage ? <UpgradeCallout /> : null}
        </section>
      </div>
    </aside>
  );
}
