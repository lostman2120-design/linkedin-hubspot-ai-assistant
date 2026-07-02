export const sidebarStyles = `
  :host {
    all: initial;
    color-scheme: light;
  }

  * {
    box-sizing: border-box;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  .lhai-shell {
    position: fixed;
    top: 72px;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    width: min(380px, calc(100vw - 32px));
    height: auto;
    max-height: none;
    background: #f3f6fa;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    box-shadow: 0 20px 55px rgba(15, 23, 42, 0.24);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .lhai-header {
    flex: 0 0 auto;
    padding: 15px 16px;
    background: linear-gradient(135deg, #0f172a 0%, #164e63 100%);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .lhai-header-badges {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  .lhai-plan-badge {
    min-width: max-content;
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 11px;
    line-height: 1.2;
    font-weight: 800;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .lhai-plan-badge-free {
    background: rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
  }

  .lhai-plan-badge-pro {
    background: #dcfce7;
    border-color: #86efac;
    color: #166534;
  }

  .lhai-pro-active {
    color: #bbf7d0;
    font-size: 11px;
    line-height: 1.2;
    font-weight: 800;
  }

  .lhai-title {
    margin: 0;
    font-size: 15px;
    line-height: 1.25;
    font-weight: 700;
  }

  .lhai-subtitle {
    margin: 3px 0 0;
    color: #cbd5e1;
    font-size: 11px;
    line-height: 1.3;
  }

  .lhai-status {
    min-width: max-content;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    padding: 5px 8px;
    font-size: 11px;
    color: #dbeafe;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.08);
  }

  .lhai-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #94a3b8;
  }

  .lhai-status-analysis_complete .lhai-status-dot,
  .lhai-status-success .lhai-status-dot {
    background: #34d399;
  }

  .lhai-status-error .lhai-status-dot {
    background: #f87171;
  }

  .lhai-status-analyzing .lhai-status-dot,
  .lhai-status-generating_dm .lhai-status-dot,
  .lhai-status-syncing_hubspot .lhai-status-dot {
    background: #38bdf8;
    box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.18);
  }

  .lhai-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    padding: 12px 12px 72px;
  }

  .lhai-section {
    margin-top: 10px;
  }

  .lhai-section:first-child {
    margin-top: 0;
  }

  .lhai-card {
    background: #ffffff;
    border: 1px solid #dde5ef;
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .lhai-hero-card {
    border-color: #c7d2fe;
    background: #ffffff;
  }

  .lhai-decision-card {
    border-color: #a7f3d0;
    background: #f0fdf4;
  }

  .lhai-decision-badge {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    margin: 2px 0 7px;
    border: 1px solid;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 850;
  }

  .lhai-decision-pursue {
    background: #dcfce7;
    border-color: #86efac;
    color: #166534;
  }

  .lhai-decision-research {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #1d4ed8;
  }

  .lhai-decision-low {
    background: #fffbeb;
    border-color: #fde68a;
    color: #92400e;
  }

  .lhai-decision-stop {
    background: #fef2f2;
    border-color: #fecaca;
    color: #991b1b;
  }

  .lhai-strategy-list {
    display: grid;
    gap: 9px;
  }

  .lhai-strategy-field {
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 8px;
  }

  .lhai-strategy-field:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .lhai-usage-panel {
    display: grid;
    gap: 6px;
    margin-bottom: 10px;
    border: 1px solid #d8e0eb;
    border-radius: 8px;
    background: #f8fafc;
    padding: 9px 10px;
    color: #334155;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 700;
  }

  .lhai-action-card {
    margin-bottom: 2px;
  }

  .lhai-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
  }

  .lhai-label {
    display: block;
    margin: 0 0 4px;
    font-size: 11px;
    line-height: 1.25;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
  }

  .lhai-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: #eef6ff;
    color: #075985;
    border: 1px solid #bae6fd;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
  }

  .lhai-pill-success {
    background: #ecfdf5;
    color: #166534;
    border-color: #bbf7d0;
  }

  .lhai-pill-warning {
    background: #fffbeb;
    color: #92400e;
    border-color: #fde68a;
  }

  .lhai-value {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: #111827;
    overflow-wrap: anywhere;
  }

  .lhai-muted {
    color: #64748b;
  }

  .lhai-helper-text {
    margin: -1px 0 8px;
    color: #64748b;
    font-size: 12px;
    line-height: 1.4;
  }

  .lhai-profile-name {
    margin: 0 0 5px;
    color: #0f172a;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .lhai-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .lhai-metric {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px;
    background: #f8fafc;
    min-height: 86px;
  }

  .lhai-score {
    font-size: 26px;
    line-height: 1;
    font-weight: 800;
    color: #0f766e;
  }

  .lhai-score-unknown {
    display: block;
    font-size: 15px;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .lhai-score-subtext {
    display: block;
    margin-top: 5px;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  .lhai-list {
    margin: 6px 0 0;
    padding-left: 18px;
    color: #111827;
    font-size: 13px;
    line-height: 1.45;
  }

  .lhai-icp-card {
    border-color: #d8e0eb;
    background: #fbfdff;
  }

  .lhai-context-card {
    border-color: #d8e0eb;
    background: #ffffff;
  }

  .lhai-icp-list {
    display: grid;
    gap: 6px;
    margin-top: 9px;
  }

  .lhai-icp-row {
    display: grid;
    grid-template-columns: 86px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
    padding: 7px 8px;
    font-size: 12px;
    line-height: 1.35;
  }

  .lhai-icp-row span {
    color: #64748b;
    font-weight: 800;
  }

  .lhai-icp-row strong {
    min-width: 0;
    color: #0f172a;
    font-weight: 750;
    overflow-wrap: anywhere;
  }

  .lhai-stack {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }

  .lhai-evidence-panel {
    margin-top: 12px;
    border-top: 1px solid #e2e8f0;
    padding-top: 12px;
  }

  .lhai-evidence-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }

  .lhai-evidence-meta span {
    border-radius: 999px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    color: #475569;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 750;
  }

  .lhai-evidence-group {
    margin-top: 10px;
  }

  .lhai-evidence-list {
    display: grid;
    gap: 8px;
  }

  .lhai-evidence-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    padding: 9px;
  }

  .lhai-evidence-card strong {
    color: #0f172a;
    font-size: 12px;
    line-height: 1.35;
  }

  .lhai-evidence-badge {
    flex: 0 0 auto;
    border-radius: 999px;
    border: 1px solid #cbd5e1;
    padding: 3px 7px;
    font-size: 10px;
    line-height: 1.2;
    font-weight: 800;
  }

  .lhai-evidence-badge-fact {
    background: #ecfdf5;
    color: #166534;
    border-color: #bbf7d0;
  }

  .lhai-evidence-badge-inference {
    background: #fff7ed;
    color: #9a3412;
    border-color: #fed7aa;
  }

  .lhai-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .lhai-actions-single {
    grid-template-columns: 1fr;
    margin-top: 12px;
  }

  .lhai-button {
    appearance: none;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
    color: #0f172a;
    min-height: 38px;
    padding: 9px 10px;
    font-size: 12px;
    line-height: 1.15;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      color 120ms ease,
      transform 120ms ease,
      box-shadow 120ms ease;
  }

  .lhai-button:hover:not(:disabled) {
    border-color: #0f766e;
    background: #ecfeff;
    box-shadow: 0 3px 10px rgba(15, 118, 110, 0.12);
    transform: translateY(-1px);
  }

  .lhai-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    box-shadow: none;
    transform: none;
  }

  .lhai-button-locked {
    background: #f1f5f9;
    border-color: #cbd5e1;
    color: #64748b;
    box-shadow: none;
  }

  .lhai-button-locked:hover:not(:disabled) {
    background: #eef2ff;
    border-color: #a5b4fc;
    color: #334155;
    transform: none;
    box-shadow: none;
  }

  .lhai-lock-icon {
    position: relative;
    display: inline-block;
    width: 12px;
    height: 10px;
    border: 2px solid currentColor;
    border-radius: 2px;
    flex: 0 0 auto;
  }

  .lhai-lock-icon::before {
    content: "";
    position: absolute;
    left: 1px;
    top: -8px;
    width: 6px;
    height: 7px;
    border: 2px solid currentColor;
    border-bottom: 0;
    border-radius: 7px 7px 0 0;
  }

  .lhai-button-primary {
    background: #0f766e;
    border-color: #0f766e;
    color: #ffffff;
    box-shadow: 0 8px 18px rgba(15, 118, 110, 0.22);
  }

  .lhai-button-primary:hover:not(:disabled) {
    background: #115e59;
    color: #ffffff;
  }

  .lhai-button-primary.lhai-button-locked {
    background: #f1f5f9;
    border-color: #cbd5e1;
    color: #64748b;
    box-shadow: none;
  }

  .lhai-button-primary.lhai-button-locked:hover:not(:disabled) {
    background: #eef2ff;
    border-color: #a5b4fc;
    color: #334155;
  }

  .lhai-button-loading {
    position: relative;
    color: transparent;
  }

  .lhai-button-loading::after {
    content: "";
    position: absolute;
    inset: 0;
    margin: auto;
    width: 15px;
    height: 15px;
    border: 2px solid rgba(15, 23, 42, 0.18);
    border-top-color: #0f766e;
    border-radius: 999px;
    animation: lhai-spin 700ms linear infinite;
  }

  .lhai-button-primary.lhai-button-loading::after {
    border-color: rgba(255, 255, 255, 0.35);
    border-top-color: #ffffff;
  }

  .lhai-mini-button {
    appearance: none;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #ffffff;
    color: #0f172a;
    min-height: 26px;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .lhai-mini-button:hover:not(:disabled) {
    border-color: #0f766e;
    background: #ecfeff;
  }

  .lhai-mini-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .lhai-link-button {
    appearance: none;
    border: 0;
    background: transparent;
    color: #0f766e;
    margin: 8px 0 0;
    padding: 0;
    font-size: 12px;
    line-height: 1.25;
    font-weight: 800;
    cursor: pointer;
  }

  .lhai-link-button:hover {
    color: #115e59;
    text-decoration: underline;
  }

  .lhai-dm {
    white-space: pre-wrap;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px;
    background: #f8fafc;
    min-height: 104px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  .lhai-dm .lhai-value {
    font-size: 13.5px;
    line-height: 1.55;
  }

  .lhai-empty-state {
    border-style: dashed;
    background: #f8fafc;
    color: #64748b;
  }

  .lhai-dm-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .lhai-dm-meta span {
    border-radius: 999px;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 700;
  }

  .lhai-variant-list {
    display: grid;
    gap: 9px;
  }

  .lhai-variant {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    padding: 10px;
  }

  .lhai-variant .lhai-value + .lhai-value {
    margin-top: 6px;
  }

  .lhai-alert {
    margin: 10px 0 0;
    border-radius: 8px;
    padding: 10px 11px;
    font-size: 12px;
    line-height: 1.4;
    overflow-wrap: anywhere;
    font-weight: 650;
  }

  .lhai-alert-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }

  .lhai-alert-success {
    background: #ecfdf5;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .lhai-alert-warning {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
  }

  .lhai-upgrade-callout {
    margin-top: 10px;
    border: 1px solid #c7d2fe;
    border-radius: 8px;
    background: #f8fafc;
    padding: 11px;
  }

  .lhai-upgrade-callout h3 {
    margin: 0 0 5px;
    color: #0f172a;
    font-size: 14px;
    line-height: 1.2;
    font-weight: 800;
  }

  .lhai-upgrade-callout p {
    margin: 0 0 8px;
    color: #475569;
    font-size: 12px;
    line-height: 1.45;
  }

  .lhai-upgrade-callout strong {
    display: inline-block;
    margin-right: 8px;
    color: #0f172a;
    font-size: 13px;
  }

  .lhai-upgrade-callout a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    border-radius: 8px;
    background: #0f766e;
    color: #ffffff;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 800;
    text-decoration: none;
  }

  .lhai-upgrade-callout a:hover {
    background: #115e59;
  }

  .lhai-license-panel {
    margin-top: 10px;
    border: 1px solid #d8e0eb;
    border-radius: 8px;
    background: #ffffff;
    padding: 11px;
  }

  .lhai-license-label {
    display: block;
    margin: 0 0 5px;
    color: #334155;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.25;
  }

  .lhai-license-input {
    width: 100%;
    min-height: 36px;
    border: 1px solid #9aa9bb;
    border-radius: 8px;
    background: #ffffff;
    color: #111827;
    padding: 8px 9px;
    font-size: 13px;
    line-height: 1.25;
  }

  .lhai-license-input:focus {
    border-color: #0f766e;
    outline: 3px solid rgba(15, 118, 110, 0.12);
  }

  .lhai-license-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }

  .lhai-license-status {
    margin-top: 8px;
    border-radius: 8px;
    padding: 8px 9px;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 800;
  }

  .lhai-license-status-active {
    background: #ecfdf5;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .lhai-license-status-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }

  @keyframes lhai-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
