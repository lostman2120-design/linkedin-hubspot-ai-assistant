import type { DailyUsage, StoredLicenseState } from "./storage";
import { FREE_PLAN_LIMITS } from "./storage";

export type PlanFeature =
  | "analyze_profile"
  | "connection_message"
  | "first_dm"
  | "follow_up"
  | "add_to_hubspot"
  | "create_hubspot_note"
  | "create_follow_up_task";

type PlanAccessInput = {
  feature: PlanFeature;
  licenseState: StoredLicenseState;
  usage: DailyUsage;
};

export type PlanAccessResult = {
  allowed: boolean;
  reason?: "limit_reached" | "beta_pro_only";
  message?: string;
};

export function isBetaProLicenseActive(licenseState: StoredLicenseState): boolean {
  return licenseState.valid && licenseState.plan === "beta_pro" && licenseState.status === "active";
}

export function planLabel(licenseState: StoredLicenseState): "Free plan" | "Beta Pro" {
  return isBetaProLicenseActive(licenseState) ? "Beta Pro" : "Free plan";
}

export function getPlanAccess({ feature, licenseState, usage }: PlanAccessInput): PlanAccessResult {
  if (isBetaProLicenseActive(licenseState)) {
    return { allowed: true };
  }

  if (feature === "analyze_profile") {
    if (usage.profileAnalyses >= FREE_PLAN_LIMITS.profileAnalyses) {
      return {
        allowed: false,
        reason: "limit_reached",
        message: "You used all 3 free profile analyses today."
      };
    }

    return { allowed: true };
  }

  if (feature === "first_dm") {
    if (usage.outreachDrafts >= FREE_PLAN_LIMITS.outreachDrafts) {
      return {
        allowed: false,
        reason: "limit_reached",
        message: "You used your free outreach draft today."
      };
    }

    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "beta_pro_only",
    message: "Available in Beta Pro"
  };
}

export function isFeatureLockedForFree(feature: PlanFeature, licenseState: StoredLicenseState): boolean {
  return !isBetaProLicenseActive(licenseState) && feature !== "analyze_profile" && feature !== "first_dm";
}
