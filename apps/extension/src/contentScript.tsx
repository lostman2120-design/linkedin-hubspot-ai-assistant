import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { isLinkedInProfilePage } from "./linkedinProfileExtractor";
import { SidebarApp } from "./sidebar/SidebarApp";
import { SidebarErrorBoundary } from "./sidebar/SidebarErrorBoundary";
import { sidebarStyles } from "./sidebar/styles";
import { dispatchProfileUrlChanged } from "./urlEvents";

const HOST_ID = "linkedin-hubspot-ai-assistant-sidebar";
let root: Root | null = null;
let lastUrl = window.location.href;
let mutationCheckQueued = false;

type PatchedWindow = typeof window & {
  __linkedinHubSpotAiHistoryPatched?: boolean;
};

function removeSidebar() {
  root?.unmount();
  root = null;
  document.getElementById(HOST_ID)?.remove();
}

function mountSidebar() {
  if (!isLinkedInProfilePage()) {
    removeSidebar();
    return;
  }

  const existingHost = document.getElementById(HOST_ID);
  if (existingHost && root) {
    return;
  }

  if (existingHost && !root) {
    existingHost.remove();
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = sidebarStyles;
  const appRoot = document.createElement("div");
  shadow.append(style, appRoot);
  document.documentElement.appendChild(host);

  root = createRoot(appRoot);
  root.render(
    <React.StrictMode>
      <SidebarErrorBoundary>
        <SidebarApp />
      </SidebarErrorBoundary>
    </React.StrictMode>
  );
}

mountSidebar();

function handleUrlMaybeChanged() {
  if (window.location.href === lastUrl) {
    mountSidebar();
    return;
  }

  lastUrl = window.location.href;
  dispatchProfileUrlChanged(lastUrl);
  mountSidebar();
}

function patchHistoryNavigation() {
  const patchedWindow = window as PatchedWindow;
  if (patchedWindow.__linkedinHubSpotAiHistoryPatched) {
    return;
  }

  patchedWindow.__linkedinHubSpotAiHistoryPatched = true;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function patchedPushState(...args) {
    const result = originalPushState.apply(this, args);
    queueMicrotask(handleUrlMaybeChanged);
    return result;
  };

  history.replaceState = function patchedReplaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    queueMicrotask(handleUrlMaybeChanged);
    return result;
  };
}

patchHistoryNavigation();
window.addEventListener("popstate", () => setTimeout(handleUrlMaybeChanged, 0));

const observer = new MutationObserver(() => {
  if (mutationCheckQueued) {
    return;
  }

  mutationCheckQueued = true;
  setTimeout(() => {
    mutationCheckQueued = false;
    handleUrlMaybeChanged();
  }, 250);
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
}

setInterval(() => {
  handleUrlMaybeChanged();
}, 1000);
