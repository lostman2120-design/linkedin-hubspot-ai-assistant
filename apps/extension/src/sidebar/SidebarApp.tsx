import { useEffect, useMemo, useRef, useState } from "react";
import type { DmVariant, GeneratedDm, HubSpotSyncResult, LinkedInProfile, MessageType, ProfileAnalysis, ScoreEvidence, UserSettings } from "@linkedin-hubspot-ai/shared";
import {
  DEFAULT_USER_SETTINGS,
  PROFILE_TEXT_LIMITS,
  UNABLE_TO_EXTRACT_FIELD,
  getProfileUrl,
  validateLinkedInProfileIdentity
} from "@linkedin-hubspot-ai/shared";
import { apiRequest } from "../apiClient";
import { STRIPE_PAYMENT_LINK } from "../billing";
import {
  activateLicenseKey,
  removeLicenseKey,
  statusMessageForLicenseState,
  type LicenseStatusMessage
} from "../licenseActivation";
import { extractLinkedInProfile, getCurrentLinkedInProfileUrl, isLinkedInProfilePage } from "../linkedinProfileExtractor";
import { openExtensionOptionsPage } from "../optionsNavigation";
import { getPlanAccess, isBetaProLicenseActive, isFeatureLockedForFree, planLabel, type PlanFeature } from "../plan";
import {
  DAILY_USAGE_KEY,
  DEFAULT_LICENSE_STATE,
  FREE_PLAN_LIMITS,
  LICENSE_STATE_KEY,
  SETTINGS_KEY,
  getDailyUsage,
  getStoredLicenseState,
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
  localActionStatusForFollowUpTaskResult,
  localActionStatusForHubSpotSync,
  type LocalActionStatus
} from "./sidebarState";
import { normalizeAnalysisResult } from "./analysisNormalizer";
import { buildIcpSummaryFields, getIcpSettingsSafe } from "./icpSummary";
import { buildSellerContextSummaryFields, sellerContextStatus } from "./sellerContextSummary";

type SidebarStatus = "idle" | "analyzing" | "analysis_complete" | "generating_dm" | "syncing_hubspot" | "success" | "error";
type PendingHubSpotAction = "contact" | "note" | "task";
type FollowUpTaskResult =
  | {
      taskId: string;
      fallback: false;
      createdAs: "task";
      message: string;
    }
  | {
      noteId: string;
      fallback: true;
      createdAs: "note";
      message: string;
    };

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

  if (score >= 40) {
    return "Possible fit";
  }

  if (score >= 15) {
    return "Weak fit";
  }

  return "Not enough data";
}

function titleCaseConfidence(value: string | undefined): string {
  if (!value) {
    return "Not analyzed";
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function compactSnippet(value: string | undefined, fallback: string): string {
  if (!value?.trim()) {
    return fallback;
  }

  return value.trim().length > 260 ? `${value.trim().slice(0, 260)}...` : value.trim();
}

function confidenceExplanation(analysis: ProfileAnalysis | null): string {
  if (!analysis) {
    return "Analyze this profile to see confidence details.";
  }

  const metadata = analysis.scoringMetadata;
  if (analysis.confidence === "low") {
    return "Low confidence because visible evidence is limited or important ICP criteria are missing.";
  }

  if (metadata.disqualifierCount > 0) {
    return "Confidence is affected by visible disqualifiers that should be reviewed before outreach.";
  }

  if (metadata.missingCriteriaCount > metadata.factsUsedCount) {
    return "Confidence is limited because several ICP criteria are not visible on the profile.";
  }

  return "Confidence is based on visible profile facts, saved ICP settings, and clearly labeled AI inferences.";
}

function evidenceGroup(items: ScoreEvidence[], signalType: ScoreEvidence["signalType"], basis?: ScoreEvidence["basis"]): ScoreEvidence[] {
  return items.filter((item) => item.signalType === signalType && (!basis || item.basis === basis));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

function EvidenceGroup({ title, items, inference = false }: { title: string; items: ScoreEvidence[]; inference?: boolean }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="lhai-evidence-group">
      <span className="lhai-label">{title}</span>
      <div className="lhai-evidence-list">
        {items.map((item) => (
          <article className="lhai-evidence-card" key={item.id}>
            <div className="lhai-section-heading">
              <strong>{item.summary}</strong>
              <span className={`lhai-evidence-badge ${item.basis === "fact" ? "lhai-evidence-badge-fact" : "lhai-evidence-badge-inference"}`}>
                {inference || item.basis === "inference" ? "AI inference - not confirmed" : "Fact"}
              </span>
            </div>
            {item.evidenceText ? <p className="lhai-value">Evidence: {item.evidenceText}</p> : null}
            <p className="lhai-value lhai-muted">
              Source: {item.sourceSection.replace("_", " ")} · Confidence: {item.confidence}
              {typeof item.scoreImpact === "number" ? ` · Impact: ${item.scoreImpact > 0 ? "+" : ""}${item.scoreImpact}` : ""}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
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
  const [icpUsingDefaults, setIcpUsingDefaults] = useState(true);
  const [icpLoadFailed, setIcpLoadFailed] = useState(false);
  const [showIcpDetails, setShowIcpDetails] = useState(false);
  const [showSellerContextDetails, setShowSellerContextDetails] = useState(false);
  const [showAllScoreEvidence, setShowAllScoreEvidence] = useState(false);
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
  const [pendingHubSpotAction, setPendingHubSpotAction] = useState<PendingHubSpotAction | null>(null);
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
  const renderedAnalysis = useMemo(() => (analysis ? normalizeAnalysisResult(analysis) : null), [analysis]);
  const leadScoreDisplay = renderedAnalysis ? (renderedAnalysis.confidence === "low" ? "Fit: Unknown" : String(renderedAnalysis.leadScore)) : "--";
  const showScoringSettingsWarning = !hasLeadScoringSettings(settings);
  const analyzeButtonLabel = status === "analyzing" ? "Analyzing..." : "Analyze Profile";
  const isGeneratingDm = status === "generating_dm";
  const isSyncingHubSpot = status === "syncing_hubspot";
  const isCreatingFollowUpTask = isSyncingHubSpot && pendingHubSpotAction === "task";
  const createFollowUpTaskButtonLabel = isCreatingFollowUpTask ? "Creating follow-up task..." : "Create Follow-up Task";
  const analyzeAccess = getPlanAccess({ feature: "analyze_profile", licenseState, usage: dailyUsage });
  const firstDmAccess = getPlanAccess({ feature: "first_dm", licenseState, usage: dailyUsage });
  const isAnalyzeBlockedByPlan = !analyzeAccess.allowed;
  const isFirstDmBlockedByPlan = !firstDmAccess.allowed;
  const isConnectionMessageLocked = isFeatureLockedForFree("connection_message", licenseState);
  const isFollowUpLocked = isFeatureLockedForFree("follow_up", licenseState);
  const areHubSpotActionsLocked = !isBetaPro;
  const positiveSignals = renderedAnalysis?.positiveSignals ?? [];
  const negativeSignals = renderedAnalysis?.negativeSignals ?? [];
  const missingInformation = renderedAnalysis?.missingInformation ?? [];
  const riskWarnings = renderedAnalysis?.riskWarnings ?? [];
  const painPoints = renderedAnalysis?.painPoints ?? [];
  const whatToAvoid = renderedAnalysis?.whatToAvoid ?? [];
  const dmVariants = renderedAnalysis?.dmVariants ?? [];
  const scoreEvidence = renderedAnalysis?.scoreEvidence ?? [];
  const visibleScoreEvidence = showAllScoreEvidence ? scoreEvidence : scoreEvidence.slice(0, 6);
  const generatedDmWarnings = Array.isArray(visibleGeneratedDm?.warnings) ? visibleGeneratedDm.warnings : [];
  const extractionWarnings = Array.isArray(profile?.extractionWarnings) ? profile.extractionWarnings : [];
  const icpSummaryFields = useMemo(() => buildIcpSummaryFields(settings), [settings]);
  const primaryIcpSummaryFields = icpSummaryFields.slice(0, 3);
  const detailedIcpSummaryFields = showIcpDetails ? icpSummaryFields.slice(3) : [];
  const sellerContextSummaryFields = useMemo(() => buildSellerContextSummaryFields(settings), [settings]);
  const primarySellerContextFields = sellerContextSummaryFields.slice(0, 3);
  const detailedSellerContextFields = showSellerContextDetails ? sellerContextSummaryFields.slice(3) : [];
  const currentSellerContextStatus = sellerContextStatus(settings.sellerContext);

  useEffect(() => {
    void refreshSettingsState();
    void refreshPlanState(true);
  }, []);

  useEffect(() => {
    const handleStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "local" && changes[SETTINGS_KEY]) {
        void refreshSettingsState();
      }

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

  async function refreshSettingsState() {
    const result = await getIcpSettingsSafe();
    setSettings(result.settings);
    setIcpUsingDefaults(result.usingDefaults);
    setIcpLoadFailed(result.loadFailed);
  }

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

  async function openOptionsPage() {
    const result = await openExtensionOptionsPage();
    if (!result.ok) {
      setStatus("error");
      setMessage(result.error || "Options page could not be opened. Open it from the extension popup or chrome://extensions.");
    }
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
        let refreshFailed = false;
        await refreshPlanState(true).catch(() => {
          refreshFailed = true;
        });
        setStatus("success");
        setMessage(refreshFailed ? "License activated. If the plan does not update, please close and reopen the extension popup." : "License active");
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
    setPendingHubSpotAction(null);
    setMessage(null);
    setLocalActionStatus(null);
    setUpgradeMessage(null);
    setStatus("idle");
    setNextAction(DEFAULT_NEXT_ACTION);
  }

  async function extractProfileWithSingleRetry(): Promise<LinkedInProfile> {
    if (!isLinkedInProfilePage()) {
      throw new Error("Open a LinkedIn profile page before analyzing.");
    }

    let extractedProfile = extractLinkedInProfile();
    let validation = validateLinkedInProfileIdentity(extractedProfile);

    if (validation.ok) {
      return extractedProfile;
    }

    setMessage("Profile is still loading. Retrying...");
    await delay(800);

    extractedProfile = extractLinkedInProfile();
    validation = validateLinkedInProfileIdentity(extractedProfile);

    if (!validation.ok) {
      throw new Error(validation.message);
    }

    return extractedProfile;
  }

  function hubSpotPreflightError(profileToSync: LinkedInProfile): string | null {
    const validation = validateLinkedInProfileIdentity(profileToSync);
    console.log("[SidebarApp] HubSpot sync preflight.", {
      fullName: profileToSync.fullName,
      headline: profileToSync.headline,
      companyName: profileToSync.companyName,
      location: profileToSync.location,
      profileUrl: getProfileUrl(profileToSync),
      passed: validation.ok,
      failure: validation.ok ? undefined : validation.reason
    });

    return validation.ok ? null : validation.message;
  }

  async function analyzeProfile() {
    if (!ensurePlanAccess("analyze_profile")) {
      return;
    }

    try {
      setStatus("analyzing");
      setMessage(null);
      setNextAction("The AI is reviewing the visible profile information.");
      const extractedProfile = await extractProfileWithSingleRetry();
      const profileUrl = extractedProfile.profileUrl;
      const shouldPreservePreviousAnalysis = profileUrl === lastAnalyzedProfileUrl && renderedAnalysis;
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
      setAnalysis(shouldPreservePreviousAnalysis ? renderedAnalysis : null);
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
      console.log("[SidebarApp] Analyze Profile request prepared.", {
        profileUrl,
        fullName: extractedProfile.fullName || undefined,
        visibleTextSampleLength: extractedProfile.visibleTextSample?.length ?? 0,
        rawVisibleContextLength: extractedProfile.visibleProfileContext?.rawVisibleContext?.length ?? 0,
        visibleTextSampleLimit: PROFILE_TEXT_LIMITS.visibleTextSample
      });

      const result = await apiRequest<unknown>("/ai/analyze-profile", {
        method: "POST",
        body: { profile: extractedProfile, userSettings: settings }
      });
      const normalizedResult = normalizeAnalysisResult(result);
      console.log("[SidebarApp] Analyze Profile response normalized.", {
        profileUrl,
        leadScore: normalizedResult.leadScore,
        confidence: normalizedResult.confidence,
        positiveSignals: normalizedResult.positiveSignals.length,
        negativeSignals: normalizedResult.negativeSignals.length,
        missingInformation: normalizedResult.missingInformation.length,
        riskWarnings: normalizedResult.riskWarnings.length,
        dmVariants: normalizedResult.dmVariants.length
      });

      if (activeProfileUrlRef.current !== profileUrl || analysisRequestIdRef.current !== requestId) {
        return;
      }

      setAnalysis(normalizedResult);
      setStatus("analysis_complete");
      setNextAction(normalizedResult.recommendedNextAction || normalizedResult.recommendedAction);
      setMessage(normalizedResult.dmVariants.length ? "Profile analysis is ready." : "Profile analysis is ready. DM variants could not be generated. Please try again.");

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

    if (!profile || !renderedAnalysis) {
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
        body: { profile, analysis: renderedAnalysis, messageType, userSettings: settings }
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

  async function copyDmVariant(variant: DmVariant) {
    try {
      await copyText(variant.text);
      setStatus("success");
      setLocalActionStatus({ type: "success", message: `${variant.label} copied.` });
    } catch {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "The message could not be copied. Please select the text and copy it manually." });
    }
  }

  async function addToHubSpot() {
    if (!ensurePlanAccess("add_to_hubspot", "bottom")) {
      return;
    }

    if (!profile || !renderedAnalysis) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "Analyze the profile before adding it to HubSpot." });
      return;
    }

    const preflightError = hubSpotPreflightError(profile);
    if (preflightError) {
      setCrmStatus("Sync blocked");
      setStatus("error");
      setLocalActionStatus({ type: "error", message: preflightError });
      return;
    }

    try {
      setStatus("syncing_hubspot");
      setPendingHubSpotAction("contact");
      setMessage(null);
      setLocalActionStatus(null);
      setUpgradeMessage(null);
      setCrmStatus("Syncing");

      const result = await apiRequest<HubSpotSyncResult>("/hubspot/upsert-contact", {
        method: "POST",
        body: { profile, analysis: renderedAnalysis, generatedDm: visibleGeneratedDm ?? undefined, userSettings: settings }
      });

      setContactId(result.contactId);
      setSyncedProfileUrl(profile.profileUrl);
      setCrmStatus(result.created ? "Created in HubSpot" : "Updated in HubSpot");
      setStatus("success");
      setLocalActionStatus({
        type: "success",
        message: result.message ?? localActionStatusForHubSpotSync(result.created).message
      });
    } catch (error) {
      setCrmStatus("Sync failed");
      setStatus("error");
      setLocalActionStatus({ type: "error", message: friendlyError(error) });
    } finally {
      setPendingHubSpotAction(null);
    }
  }

  async function createHubSpotNote() {
    if (!ensurePlanAccess("create_hubspot_note", "bottom")) {
      return;
    }

    if (!profile || !renderedAnalysis || !contactId) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "Add or update the contact in HubSpot before creating a note." });
      return;
    }

    try {
      setStatus("syncing_hubspot");
      setPendingHubSpotAction("note");
      setMessage(null);
      setLocalActionStatus(null);
      setUpgradeMessage(null);
      await apiRequest<{ noteId: string }>("/hubspot/create-note", {
        method: "POST",
        body: { contactId, profile, analysis: renderedAnalysis, dmMessage: visibleGeneratedDm?.message, userSettings: settings }
      });
      setNoteStatus("created");
      setStatus("success");
      setLocalActionStatus({ type: "success", message: "HubSpot note created." });
    } catch (error) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: friendlyError(error) });
    } finally {
      setPendingHubSpotAction(null);
    }
  }

  async function createFollowUpTask() {
    if (!ensurePlanAccess("create_follow_up_task", "bottom")) {
      return;
    }

    if (!contactId) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "Please add this profile to HubSpot before creating a follow-up task." });
      return;
    }

    if (!profile) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: "Profile information is missing. Please analyze the LinkedIn profile again." });
      return;
    }

    try {
      setStatus("syncing_hubspot");
      setPendingHubSpotAction("task");
      setMessage(null);
      setLocalActionStatus(null);
      setUpgradeMessage(null);
      const result = await apiRequest<FollowUpTaskResult>("/hubspot/create-task", {
        method: "POST",
        body: {
          contactId,
          profile,
          daysFromNow: settings.defaultFollowUpDays,
          taskTitle: "Follow up from LinkedIn profile review",
          taskBody: visibleGeneratedDm?.message
            ? `Follow up based on the generated LinkedIn message:\n\n${visibleGeneratedDm.message}`
            : "Follow up based on the LinkedIn profile analysis."
        }
      });
      setTaskStatus("created");
      setStatus("success");
      setLocalActionStatus(localActionStatusForFollowUpTaskResult(result.fallback));
    } catch (error) {
      setStatus("error");
      setLocalActionStatus({ type: "error", message: friendlyError(error) });
    } finally {
      setPendingHubSpotAction(null);
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
          {isBetaPro ? <span className="lhai-pro-active">{currentPlanLabel} active</span> : null}
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
              disabled={isBusy || (!isConnectionMessageLocked && !renderedAnalysis)}
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
              disabled={isBusy || (!isFirstDmBlockedByPlan && !renderedAnalysis)}
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
              disabled={isBusy || (!isFollowUpLocked && !renderedAnalysis)}
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
              {isBetaPro ? <span className="lhai-pill lhai-pill-success">{currentPlanLabel} active</span> : null}
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
                {isLicenseBusy ? "Activating..." : "Activate license"}
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
          <p className="lhai-value lhai-muted">{sectionValue(profile?.location, "Location not detected yet.")}</p>
          {profile?.profileUrl ? <p className="lhai-value lhai-muted">{profile.profileUrl}</p> : null}
        </section>

        <section className="lhai-section lhai-card lhai-icp-card" aria-label="Scoring against ICP">
          <div className="lhai-section-heading">
            <span className="lhai-label">Scoring against ICP</span>
            <button className="lhai-mini-button" type="button" onClick={() => void openOptionsPage()}>
              Edit ICP
            </button>
          </div>
          <p className="lhai-helper-text">The lead score and DM drafts use these settings.</p>
          {icpLoadFailed ? (
            <div className="lhai-alert lhai-alert-warning">ICP settings could not be loaded. Using defaults.</div>
          ) : icpUsingDefaults ? (
            <div className="lhai-alert lhai-alert-warning">Using default ICP. Customize it for better scoring and DM drafts.</div>
          ) : null}
          <div className="lhai-icp-list">
            {[...primaryIcpSummaryFields, ...detailedIcpSummaryFields].map((field) => (
              <div className="lhai-icp-row" key={field.label}>
                <span>{field.label}:</span>
                <strong title={field.value}>{field.value}</strong>
              </div>
            ))}
          </div>
          <button className="lhai-link-button" type="button" onClick={() => setShowIcpDetails((value) => !value)}>
            {showIcpDetails ? "Hide details" : "Show details"}
          </button>
        </section>

        <section className="lhai-section lhai-card lhai-context-card" aria-label="Messaging context">
          <div className="lhai-section-heading">
            <span className="lhai-label">Messaging context</span>
            <button className="lhai-mini-button" type="button" onClick={() => void openOptionsPage()}>
              Edit context
            </button>
          </div>
          <p className="lhai-helper-text">Used to tailor the score, outreach angle, and DM drafts.</p>
          <span
            className={`lhai-pill ${
              currentSellerContextStatus === "Custom context"
                ? "lhai-pill-success"
                : currentSellerContextStatus === "Incomplete context"
                  ? "lhai-pill-warning"
                  : ""
            }`}
          >
            {currentSellerContextStatus}
          </span>
          <div className="lhai-icp-list">
            {[...primarySellerContextFields, ...detailedSellerContextFields].map((field) => (
              <div className="lhai-icp-row" key={field.label}>
                <span>{field.label}:</span>
                <strong title={field.value}>{field.value}</strong>
              </div>
            ))}
          </div>
          <button className="lhai-link-button" type="button" onClick={() => setShowSellerContextDetails((value) => !value)}>
            {showSellerContextDetails ? "Hide details" : "Show details"}
          </button>
        </section>

        <section className="lhai-section lhai-card">
          <div className="lhai-section-heading">
            <span className="lhai-label">Profile Context</span>
            <span className="lhai-pill">Context: {titleCaseConfidence(profile?.contextConfidence)}</span>
          </div>
          <p className="lhai-value">{compactSnippet(profile?.about, "About section not detected yet.")}</p>
          <p className="lhai-value lhai-muted">
            {compactSnippet(profile?.currentRoleDescription, "Current role snippet will appear here when visible.")}
          </p>
          {extractionWarnings.length ? (
            <div className="lhai-alert lhai-alert-warning">{extractionWarnings[0]}</div>
          ) : null}
        </section>

        <section className="lhai-section lhai-card">
          <div className="lhai-grid">
            <div className="lhai-metric">
              <span className="lhai-label">ICP Fit Score</span>
              <span className={`lhai-score${renderedAnalysis?.confidence === "low" ? " lhai-score-unknown" : ""}`}>{leadScoreDisplay}</span>
              <span className="lhai-score-subtext">
                {renderedAnalysis?.fitLabel ?? (renderedAnalysis?.confidence === "low" ? "Low confidence" : scoreBand(renderedAnalysis?.leadScore))}
              </span>
            </div>
            <div className="lhai-metric">
              <span className="lhai-label">CRM Sync Status</span>
              <p className="lhai-value">{crmStatus}</p>
            </div>
          </div>
          {renderedAnalysis ? (
            <div className="lhai-stack">
              <p className="lhai-value lhai-muted">Confidence: {titleCaseConfidence(renderedAnalysis.confidence)}</p>
              {positiveSignals.length ? (
                <>
                  <span className="lhai-label">Positive Signals</span>
                  <ul className="lhai-list">
                    {positiveSignals.map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {negativeSignals.length ? (
                <>
                  <span className="lhai-label">Negative Signals</span>
                  <ul className="lhai-list">
                    {negativeSignals.map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {missingInformation.length ? (
                <>
                  <span className="lhai-label">Missing Information</span>
                  <ul className="lhai-list">
                    {missingInformation.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {riskWarnings.length ? (
                <>
                  <span className="lhai-label">Risks</span>
                  <ul className="lhai-list">
                    {riskWarnings.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="lhai-evidence-panel">
            <div className="lhai-section-heading">
              <span className="lhai-label">Why this score?</span>
              {scoreEvidence.length > 6 ? (
                <button className="lhai-mini-button" type="button" onClick={() => setShowAllScoreEvidence((value) => !value)}>
                  {showAllScoreEvidence ? "Show less" : "Show more"}
                </button>
              ) : null}
            </div>
            {renderedAnalysis ? (
              <>
                <div className="lhai-evidence-meta">
                  <span>Analysis depth: {renderedAnalysis.scoringMetadata.analysisDepth}</span>
                  <span>Facts: {renderedAnalysis.scoringMetadata.factsUsedCount}</span>
                  <span>Inferences: {renderedAnalysis.scoringMetadata.inferencesUsedCount}</span>
                  <span>Missing: {renderedAnalysis.scoringMetadata.missingCriteriaCount}</span>
                  <span>Disqualifiers: {renderedAnalysis.scoringMetadata.disqualifierCount}</span>
                </div>
                <p className="lhai-value lhai-muted">{confidenceExplanation(renderedAnalysis)}</p>
                <EvidenceGroup title="Confirmed matches" items={evidenceGroup(visibleScoreEvidence, "positive", "fact")} />
                <EvidenceGroup title="Confirmed mismatches" items={evidenceGroup(visibleScoreEvidence, "negative", "fact")} />
                <EvidenceGroup title="Missing information" items={evidenceGroup(visibleScoreEvidence, "missing")} />
                <EvidenceGroup title="Disqualifiers" items={evidenceGroup(visibleScoreEvidence, "disqualifier")} />
                <EvidenceGroup title="AI inferences" items={visibleScoreEvidence.filter((item) => item.basis === "inference")} inference />
                {!scoreEvidence.length ? <p className="lhai-value lhai-muted">No score evidence was returned. Research first before outreach.</p> : null}
              </>
            ) : (
              <p className="lhai-value lhai-muted">Analyze this profile to see visible facts, missing criteria, and AI inferences behind the score.</p>
            )}
          </div>
          {showScoringSettingsWarning ? <div className="lhai-alert lhai-alert-warning">{SCORING_SETTINGS_WARNING}</div> : null}
        </section>

        <section className="lhai-section lhai-card">
          <span className="lhai-label">Persona</span>
          <p className="lhai-value">{renderedAnalysis?.persona || "Analyze this profile to identify the likely buyer persona."}</p>
        </section>

        <section className="lhai-section lhai-card">
          <span className="lhai-label">Pain Points</span>
          {painPoints.length ? (
            <ul className="lhai-list">
              {painPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : (
            <p className="lhai-value lhai-muted">Likely pain points will appear here after analysis.</p>
          )}
        </section>

        <section className="lhai-section lhai-card">
          <span className="lhai-label">Icebreaker</span>
          <p className="lhai-value">{renderedAnalysis?.icebreaker || "A short, profile-based opener will appear here."}</p>
        </section>

        <section className="lhai-section lhai-card">
          <span className="lhai-label">Outreach Strategy</span>
          <p className="lhai-value">{renderedAnalysis?.recommendedOutreachAngle || "Analyze this profile to get a recommended angle."}</p>
          <p className="lhai-value lhai-muted">{renderedAnalysis?.whyThisAngle || "The AI will explain why this angle is safest."}</p>
          {whatToAvoid.length ? (
            <>
              <span className="lhai-label">What To Avoid</span>
              <ul className="lhai-list">
                {whatToAvoid.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="lhai-section lhai-card lhai-dm-section">
          <div className="lhai-section-heading">
            <span className="lhai-label">DM Drafts</span>
            <span className="lhai-pill">3 variants</span>
          </div>
          {dmVariants.length ? (
            <div className="lhai-variant-list">
              {dmVariants.map((variant) => (
                <article className="lhai-variant" key={variant.label}>
                  <div className="lhai-section-heading">
                    <span className="lhai-label">{variant.label}</span>
                    <button className="lhai-mini-button" type="button" onClick={() => void copyDmVariant(variant)}>
                      Copy
                    </button>
                  </div>
                  <p className="lhai-value lhai-muted">{variant.useCase}</p>
                  <p className="lhai-value">{variant.text}</p>
                  <p className="lhai-value lhai-muted">Risk: {titleCaseConfidence(variant.riskLevel)}</p>
                  {variant.personalizationUsed.length ? (
                    <p className="lhai-value lhai-muted">Personalization: {variant.personalizationUsed.join("; ")}</p>
                  ) : null}
                  {variant.offerContextUsed.length ? (
                    <p className="lhai-value lhai-muted">Offer context: {variant.offerContextUsed.join("; ")}</p>
                  ) : null}
                  {variant.factsUsed.length ? (
                    <p className="lhai-value lhai-muted">Facts used: {variant.factsUsed.join("; ")}</p>
                  ) : null}
                  {variant.inferencesUsed.length ? (
                    <p className="lhai-value lhai-muted">AI inferences: {variant.inferencesUsed.join("; ")}</p>
                  ) : null}
                  {variant.warnings.length ? (
                    <p className="lhai-value lhai-muted">Warnings: {variant.warnings.join("; ")}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="lhai-dm lhai-empty-state">
              <p className="lhai-value">{renderedAnalysis ? "DM variants could not be generated. Please try Analyze Profile again." : "Analyze this profile to generate three DM variants."}</p>
            </div>
          )}
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
          {generatedDmWarnings.length ? (
            <ul className="lhai-list">
              {generatedDmWarnings.map((warning) => (
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
              disabled={isBusy || (!areHubSpotActionsLocked && !renderedAnalysis)}
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
              {lockedButtonContent(createFollowUpTaskButtonLabel, areHubSpotActionsLocked)}
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
