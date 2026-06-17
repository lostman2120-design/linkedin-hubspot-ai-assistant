const TRUNCATION_MARKER = "[Truncated for analysis input limit]";

export const PROFILE_TEXT_LIMITS = {
  headline: 300,
  aboutText: 1000,
  currentRoleDescription: 800,
  experienceItem: 500,
  educationItem: 300,
  skillItem: 120,
  activityTotal: 600,
  rawVisibleContext: 2000,
  visibleTextSample: 2000
} as const;

type AnyRecord = Record<string, unknown>;

const boilerplateLinePattern =
  /^(show more|show less|see more|see less|connect|message|follow|following|more|save|send profile in a message|contact info|open to|view .* profile|activate to view larger image|image|premium|try premium|join now|sign in)$/i;

export function compactLinkedInProfile<T extends AnyRecord>(profile: T): T {
  const visibleProfileContext = isRecord(profile.visibleProfileContext)
    ? compactLinkedInVisibleProfileContext(profile.visibleProfileContext)
    : undefined;
  const compactProfile: AnyRecord = {
    ...profile,
    headline: truncateProfileText(profile.headline, PROFILE_TEXT_LIMITS.headline),
    about: truncateProfileText(profile.about, PROFILE_TEXT_LIMITS.aboutText),
    currentRoleDescription: truncateProfileText(profile.currentRoleDescription, PROFILE_TEXT_LIMITS.currentRoleDescription)
  };

  if (visibleProfileContext) {
    compactProfile.visibleProfileContext = visibleProfileContext;
  }

  const compactSample =
    compactVisibleProfileText(compactProfile, PROFILE_TEXT_LIMITS.visibleTextSample) ??
    truncateProfileText(profile.visibleTextSample, PROFILE_TEXT_LIMITS.visibleTextSample);

  if (compactSample) {
    compactProfile.visibleTextSample = compactSample;
  }

  if (visibleProfileContext) {
    compactProfile.visibleProfileContext = {
      ...visibleProfileContext,
      rawVisibleContext:
        compactSample ?? truncateProfileText(visibleProfileContext.rawVisibleContext, PROFILE_TEXT_LIMITS.rawVisibleContext)
    };
  }

  return compactProfile as T;
}

export function compactVisibleProfileText(source: unknown, maxChars = PROFILE_TEXT_LIMITS.visibleTextSample): string | undefined {
  const profile = isRecord(source) ? source : {};
  const context = isRecord(profile.visibleProfileContext) ? profile.visibleProfileContext : isVisibleContextLike(profile) ? profile : {};
  const identity = isRecord(context.identity) ? context.identity : {};
  const currentRole = isRecord(context.currentRole) ? context.currentRole : {};
  const about = isRecord(context.about) ? context.about : {};
  const experience = isRecord(context.experience) ? context.experience : {};
  const education = isRecord(context.education) ? context.education : {};
  const skills = isRecord(context.skills) ? context.skills : {};
  const activity = isRecord(context.activity) ? context.activity : {};

  const sections: Array<[string, string | undefined]> = [
    ["Name", firstString(profile.fullName, identity.fullName)],
    ["Headline", firstString(profile.headline, identity.headline)],
    ["Current role", joinUsefulLines([firstString(profile.currentRoleTitle, currentRole.title), firstString(profile.currentRoleCompany, currentRole.company)])],
    ["Company", firstString(profile.companyName, currentRole.company)],
    ["Location", firstString(profile.location, identity.location)],
    ["LinkedIn URL", firstString(profile.profileUrl, profile.linkedinUrl, identity.profileUrl)],
    ["About", firstString(profile.about, about.text)],
    ["Current role context", firstString(profile.currentRoleDescription, currentRole.description)],
    ["Experience", joinUsefulLines(stringArray(experience.visibleItems).map((item) => truncateProfileText(item, PROFILE_TEXT_LIMITS.experienceItem)))],
    [
      "Activity",
      joinUsefulLines(limitTotalLength(stringArray(activity.visibleSnippets), PROFILE_TEXT_LIMITS.activityTotal))
    ],
    ["Education", joinUsefulLines(stringArray(education.visibleItems).map((item) => truncateProfileText(item, PROFILE_TEXT_LIMITS.educationItem)))],
    ["Skills", joinUsefulLines(stringArray(skills.visibleItems).map((item) => truncateProfileText(item, PROFILE_TEXT_LIMITS.skillItem)))],
    ["Additional visible context", firstString(context.rawVisibleContext, profile.visibleTextSample)]
  ];

  return buildPrioritizedText(sections, maxChars);
}

export function truncateProfileText(value: unknown, maxChars: number): string | undefined {
  const cleaned = cleanVisibleProfileText(value);
  if (!cleaned) {
    return undefined;
  }

  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  const marker = `\n${TRUNCATION_MARKER}`;
  if (maxChars <= marker.length + 1) {
    return cleaned.slice(0, maxChars).trim();
  }

  return `${cleaned.slice(0, maxChars - marker.length).trimEnd()}${marker}`.slice(0, maxChars);
}

export function cleanVisibleProfileText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const uniqueLines = uniqueCleanLines(
    value
      .replace(/\u00a0/g, " ")
      .replace(/\b(show more|show less|see more|see less)\b/gi, "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
  );

  return uniqueLines.join("\n").trim() || undefined;
}

function compactLinkedInVisibleProfileContext(context: AnyRecord): AnyRecord {
  const identity = isRecord(context.identity) ? context.identity : {};
  const currentRole = isRecord(context.currentRole) ? context.currentRole : {};
  const about = isRecord(context.about) ? context.about : {};
  const experience = isRecord(context.experience) ? context.experience : {};
  const education = isRecord(context.education) ? context.education : {};
  const skills = isRecord(context.skills) ? context.skills : {};
  const activity = isRecord(context.activity) ? context.activity : {};

  return {
    ...context,
    identity: {
      ...identity,
      headline: truncateProfileText(identity.headline, PROFILE_TEXT_LIMITS.headline)
    },
    currentRole: {
      ...currentRole,
      description: truncateProfileText(currentRole.description, PROFILE_TEXT_LIMITS.currentRoleDescription)
    },
    about: {
      ...about,
      text: truncateProfileText(about.text, PROFILE_TEXT_LIMITS.aboutText)
    },
    experience: {
      ...experience,
      visibleItems: stringArray(experience.visibleItems).map((item) => truncateProfileText(item, PROFILE_TEXT_LIMITS.experienceItem)).filter(Boolean)
    },
    education: {
      ...education,
      visibleItems: stringArray(education.visibleItems).map((item) => truncateProfileText(item, PROFILE_TEXT_LIMITS.educationItem)).filter(Boolean)
    },
    skills: {
      ...skills,
      visibleItems: stringArray(skills.visibleItems).map((item) => truncateProfileText(item, PROFILE_TEXT_LIMITS.skillItem)).filter(Boolean)
    },
    activity: {
      ...activity,
      visibleSnippets: limitTotalLength(stringArray(activity.visibleSnippets), PROFILE_TEXT_LIMITS.activityTotal)
    },
    rawVisibleContext: truncateProfileText(context.rawVisibleContext, PROFILE_TEXT_LIMITS.rawVisibleContext)
  };
}

function buildPrioritizedText(sections: Array<[string, string | undefined]>, maxChars: number): string | undefined {
  let output = "";

  for (const [label, value] of sections) {
    const cleanedValue = cleanVisibleProfileText(value);
    if (!cleanedValue) {
      continue;
    }

    const block = `${label}:\n${cleanedValue}`;
    const separator = output ? "\n\n" : "";
    const nextValue = `${output}${separator}${block}`;
    if (nextValue.length <= maxChars) {
      output = nextValue;
      continue;
    }

    const remaining = maxChars - output.length - separator.length;
    if (remaining > 80) {
      output = `${output}${separator}${truncateProfileText(block, remaining) ?? ""}`.trim();
    }
    break;
  }

  return output || undefined;
}

function uniqueCleanLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const uniqueLines: string[] = [];

  for (const line of lines) {
    const cleanedLine = removeDuplicateConsecutiveSegments(line);
    const key = cleanedLine.toLowerCase();
    if (!cleanedLine || boilerplateLinePattern.test(cleanedLine) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueLines.push(cleanedLine);
  }

  return uniqueLines;
}

function limitTotalLength(values: string[], maxChars: number): string[] {
  const limitedValues: string[] = [];
  let used = 0;

  for (const value of values) {
    const cleaned = truncateProfileText(value, Math.max(0, maxChars - used));
    if (!cleaned) {
      continue;
    }

    used += cleaned.length;
    limitedValues.push(cleaned);
    if (used >= maxChars) {
      break;
    }
  }

  return limitedValues;
}

function joinUsefulLines(values: Array<string | undefined>): string | undefined {
  return cleanVisibleProfileText(values.filter(Boolean).join("\n"));
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const cleaned = cleanVisibleProfileText(value);
    if (cleaned) {
      return cleaned;
    }
  }

  return undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(cleanVisibleProfileText).filter((item): item is string => Boolean(item)) : [];
}

function isVisibleContextLike(value: AnyRecord): boolean {
  return Boolean(value.identity || value.currentRole || value.about || value.experience || value.rawVisibleContext);
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeDuplicateConsecutiveSegments(value: string): string {
  let currentValue = value.trim();
  const separators = [" | ", " · ", " • "];

  for (const separator of separators) {
    if (currentValue.includes(separator)) {
      currentValue = uniqueCleanLines(currentValue.split(separator)).join(separator);
    }
  }

  let previousValue = "";
  while (previousValue !== currentValue) {
    previousValue = currentValue;
    currentValue = removeRepeatedTokenRun(currentValue);
  }

  return currentValue;
}

function removeRepeatedTokenRun(value: string): string {
  if (value.includes(",")) {
    return value;
  }

  const tokens = value.split(" ").filter(Boolean);

  for (let length = Math.floor(tokens.length / 2); length >= 1; length -= 1) {
    const firstRun = tokens.slice(0, length);
    const secondRun = tokens.slice(length, length * 2);

    if (firstRun.length === secondRun.length && firstRun.every((token, index) => token === secondRun[index])) {
      return [...firstRun, ...tokens.slice(length * 2)].join(" ");
    }
  }

  return value;
}
