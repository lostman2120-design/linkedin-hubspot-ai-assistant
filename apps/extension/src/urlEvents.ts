export const PROFILE_URL_CHANGED_EVENT = "linkedin-hubspot-ai-assistant:profile-url-changed";

export type ProfileUrlChangedDetail = {
  href: string;
};

export function dispatchProfileUrlChanged(href = window.location.href): void {
  window.dispatchEvent(new CustomEvent<ProfileUrlChangedDetail>(PROFILE_URL_CHANGED_EVENT, { detail: { href } }));
}

