// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { SidebarErrorBoundary } from "../sidebar/SidebarErrorBoundary";

function CrashingChild() {
  throw new Error("render failed");
}

describe("SidebarErrorBoundary", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it("keeps a visible recovery panel when the sidebar render tree crashes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <SidebarErrorBoundary>
          <CrashingChild />
        </SidebarErrorBoundary>
      );
    });

    expect(container.textContent).toContain("Something went wrong while rendering the analysis result.");
    expect(container.textContent).toContain("Reset analysis state");
    expect(container.textContent).toContain("Extension version:");
  });

  it("can reset and render children again", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    let shouldCrash = true;
    function MaybeCrashingChild() {
      if (shouldCrash) {
        throw new Error("render failed");
      }

      return <p>Recovered sidebar</p>;
    }

    act(() => {
      root?.render(
        <SidebarErrorBoundary>
          <MaybeCrashingChild />
        </SidebarErrorBoundary>
      );
    });

    const button = container.querySelector("button");
    shouldCrash = false;
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Recovered sidebar");
  });
});
