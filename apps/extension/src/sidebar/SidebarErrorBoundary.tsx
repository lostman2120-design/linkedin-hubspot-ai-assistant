import React from "react";
import { EXTENSION_VERSION } from "../extensionConfig";

type SidebarErrorBoundaryProps = {
  children: React.ReactNode;
};

type SidebarErrorBoundaryState = {
  hasError: boolean;
};

export class SidebarErrorBoundary extends React.Component<SidebarErrorBoundaryProps, SidebarErrorBoundaryState> {
  state: SidebarErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): SidebarErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[SidebarErrorBoundary] Sidebar render failed.", {
      message: error.message,
      componentStack: errorInfo.componentStack
    });
  }

  reset = (): void => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <aside className="lhai-shell" aria-label="LinkedIn to HubSpot AI Assistant">
        <header className="lhai-header">
          <div>
            <h2 className="lhai-title">LinkedIn to HubSpot AI Assistant</h2>
            <p className="lhai-subtitle">AI research, outreach, and CRM updates</p>
          </div>
          <div className="lhai-header-badges">
            <span className="lhai-status lhai-status-error">
              <span className="lhai-status-dot" />
              Error
            </span>
          </div>
        </header>
        <div className="lhai-body">
          <section className="lhai-section lhai-card">
            <span className="lhai-label">Rendering Error</span>
            <p className="lhai-value">Something went wrong while rendering the analysis result.</p>
            <p className="lhai-value lhai-muted">Please refresh the LinkedIn page and try again.</p>
            <p className="lhai-value lhai-muted">Extension version: {EXTENSION_VERSION}</p>
            <div className="lhai-actions lhai-actions-single">
              <button className="lhai-button lhai-button-primary" type="button" onClick={this.reset}>
                Reset analysis state
              </button>
            </div>
          </section>
        </div>
      </aside>
    );
  }
}
