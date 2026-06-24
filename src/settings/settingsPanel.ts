import * as vscode from "vscode";
import type { GptwSettings, SurfaceConfig } from "./index";
import { t, availableLocales, type Locale } from "../util/i18n";
import { detectThemeKind } from "../util/theme";

type SettingsMessage =
  | { type: "save"; settings: GptwSettings }
  | { type: "getInitial" }
  | { type: "openEarningsPortal" };

export class SettingsPanel {
  static readonly viewType = "gptw.settings";

  private panel: vscode.WebviewPanel | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private ctx: vscode.ExtensionContext,
    private settings: GptwSettings,
    private onSave: (s: GptwSettings) => void,
  ) {}

  show(): void {
    const title = t("gptw.settings.title", {}, this.settings.language);
    this.panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      title,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, "media", "icon.png");
    this.panel.webview.html = this.renderHtml();
    this.panel.onDidDispose(() => { this.panel = null; }, null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: SettingsMessage) => this.handleMessage(msg),
      null, this.disposables,
    );
  }

  updateSettings(s: GptwSettings): void {
    this.settings = s;
    if (this.panel) {
      this.panel.title = t("gptw.settings.title", {}, s.language);
      this.panel.webview.html = this.renderHtml();
    }
  }

  private handleMessage(msg: SettingsMessage): void {
    switch (msg.type) {
      case "getInitial":
        this.postSettings();
        break;
      case "save":
        this.onSave(msg.settings);
        void vscode.window.showInformationMessage(
          t("gptw.settings.saved", {}, msg.settings.language));
        this.settings = msg.settings;
        this.panel!.title = t("gptw.settings.title", {}, msg.settings.language);
        break;
      case "openEarningsPortal":
        void vscode.env.openExternal(
          vscode.Uri.parse("https://get-paid-to-wait-m44znelko-mayurs-projects-4c08c14e.vercel.app/"));
        break;
    }
  }

  private postSettings(): void {
    void this.panel?.webview.postMessage({ type: "settings", settings: this.settings });
  }

  private renderHtml(): string {
    const s = this.settings;
    const loc = s.language;
    const locales = availableLocales();
    const themeKind = s.themeMode === "auto" ? detectThemeKind() : s.themeMode;
    const isDark = themeKind === "dark" || themeKind === "highContrast";

    return `<!DOCTYPE html>
<html lang="${loc}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  :root {
    --bg: ${isDark ? "#1e1e1e" : "#ffffff"};
    --fg: ${isDark ? "#d4d4d4" : "#383838"};
    --muted: ${isDark ? "#858585" : "#6e6e6e"};
    --border: ${isDark ? "#404040" : "#d4d4d4"};
    --input-bg: ${isDark ? "#3c3c3c" : "#f3f3f3"};
    --accent: #3794ff;
    --success: #2ea043;
    --focus: #3794ff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--fg);
    padding: 20px;
    max-width: 600px;
    margin: 0 auto;
    font-size: 14px;
    line-height: 1.5;
  }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 24px; }
  h2 { font-size: 14px; font-weight: 600; text-transform: uppercase;
       letter-spacing: 0.5px; color: var(--muted); margin: 20px 0 12px; }
  .section { border: 1px solid var(--border); border-radius: 6px;
             padding: 12px 16px; margin-bottom: 12px; }
  .row { display: flex; align-items: center; justify-content: space-between;
         min-height: 32px; gap: 12px; }
  .row + .row { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px; }
  .row-label { flex: 1; }
  .row-label .desc { font-size: 12px; color: var(--muted); margin-top: 1px; }
  input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer;
    accent-color: var(--accent); flex-shrink: 0; }
  select { background: var(--input-bg); color: var(--fg); border: 1px solid var(--border);
    border-radius: 4px; padding: 4px 8px; font-size: 13px; cursor: pointer; }
  input[type="range"] { width: 100px; accent-color: var(--accent); cursor: pointer; }
  .freq-value { min-width: 32px; text-align: center; font-variant-numeric: tabular-nums;
    color: var(--muted); font-size: 13px; }
  .actions { display: flex; gap: 8px; margin-top: 24px; }
  button { flex: 1; padding: 8px 16px; border: 1px solid var(--border);
    border-radius: 6px; font-size: 14px; cursor: pointer; }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  button.secondary { background: transparent; color: var(--fg); }
  button.secondary:hover { background: color-mix(in srgb, var(--fg) 10%, transparent); }
  .earnings-card { background: var(--input-bg); border-radius: 6px;
    padding: 12px 16px; margin-bottom: 12px; }
  .earnings-card .amount { font-size: 24px; font-weight: 600; }
  .earnings-card .label { font-size: 12px; color: var(--muted); }
  .earnings-row { display: flex; gap: 24px; }
  .earnings-row > div { flex: 1; }
</style>
</head>
<body>
<h1>${this.escHtml(t("gptw.settings.title", {}, loc))}</h1>

<div class="earnings-card">
  <div style="margin-bottom:8px;font-size:12px;color:var(--muted)">
    ${this.escHtml(t("gptw.settings.earnings", {}, loc))}
  </div>
  <div class="earnings-row">
    <div>
      <div class="label">${this.escHtml(t("gptw.settings.lifetimeEarnings", {}, loc))}</div>
      <div class="amount" id="lifetimeEarnings">—</div>
    </div>
    <div>
      <div class="label">${this.escHtml(t("gptw.settings.todayEarnings", {}, loc))}</div>
      <div class="amount" id="todayEarnings">—</div>
    </div>
  </div>
  <div style="margin-top:8px">
    <button class="secondary" onclick="openEarningsPortal()" style="font-size:12px;padding:4px 12px">
      ${this.escHtml(t("gptw.earningsPortal", {}, loc))}
    </button>
  </div>
</div>

<h2>${this.escHtml(t("gptw.settings.ads", {}, loc))}</h2>
<div class="section">
  <div class="row">
    <div class="row-label">
      <div>${this.escHtml(t("gptw.settings.adEnabled", {}, loc))}</div>
      <div class="desc">${this.escHtml(t("gptw.settings.adEnabledDesc", {}, loc))}</div>
    </div>
    <input type="checkbox" id="adEnabled" ${s.adEnabled ? "checked" : ""}>
  </div>
  <div class="row">
    <div class="row-label">
      <div>${this.escHtml(t("gptw.settings.frequency", {}, loc))}</div>
      <div class="desc">${this.escHtml(t("gptw.settings.frequencyDesc", {}, loc))}</div>
    </div>
    <input type="range" id="frequency" min="0.5" max="5" step="0.5" value="${s.frequency}">
    <span class="freq-value" id="freqValue">${s.frequency}x</span>
  </div>
</div>

<h2>${this.escHtml(t("gptw.settings.surfaces", {}, loc))}</h2>
<div class="section">
  ${this.renderSurfaceToggle("overlay", loc)}
  ${this.renderSurfaceToggle("banner", loc)}
  ${this.renderSurfaceToggle("codexOverlay", loc)}
  ${this.renderSurfaceToggle("statusline", loc)}
  ${this.renderSurfaceToggle("statusbar", loc)}
</div>

<h2>${this.escHtml(t("gptw.settings.theme", {}, loc))}</h2>
<div class="section">
  <div class="row">
    <div class="row-label">
      <div>${this.escHtml(t("gptw.settings.themeDesc", {}, loc))}</div>
    </div>
    <select id="themeMode">
      <option value="auto" ${s.themeMode === "auto" ? "selected" : ""}>
        ${this.escHtml(t("gptw.settings.themeAuto", {}, loc))}
      </option>
      <option value="dark" ${s.themeMode === "dark" ? "selected" : ""}>
        ${this.escHtml(t("gptw.settings.themeDark", {}, loc))}
      </option>
      <option value="light" ${s.themeMode === "light" ? "selected" : ""}>
        ${this.escHtml(t("gptw.settings.themeLight", {}, loc))}
      </option>
    </select>
  </div>
</div>

<h2>${this.escHtml(t("gptw.settings.language", {}, loc))}</h2>
<div class="section">
  <div class="row">
    <div class="row-label">
      <div>${this.escHtml(t("gptw.settings.languageDesc", {}, loc))}</div>
    </div>
    <select id="language">
      ${locales.map(({ code, name }) =>
        `<option value="${code}" ${s.language === code ? "selected" : ""}>${this.escHtml(name)}</option>`
      ).join("")}
    </select>
  </div>
</div>

<div class="actions">
  <button class="primary" onclick="save()">${this.escHtml(t("gptw.settings.save", {}, loc))}</button>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const freq = document.getElementById("frequency");
  const freqVal = document.getElementById("freqValue");
  freq.addEventListener("input", () => { freqVal.textContent = freq.value + "x"; });

  document.addEventListener("DOMContentLoaded", () => {
    vscode.postMessage({ type: "getInitial" });
  });

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "settings") {
      document.getElementById("lifetimeEarnings").textContent =
        "$" + (msg.settings.lifetimeUsd || "0.00");
      document.getElementById("todayEarnings").textContent =
        "$" + (msg.settings.todayUsd || "0.00");
    }
  });

  function readSettings() {
    return {
      adEnabled: document.getElementById("adEnabled").checked,
      frequency: parseFloat(document.getElementById("frequency").value),
      surfaces: {
        overlay: document.getElementById("s-overlay").checked,
        banner: document.getElementById("s-banner").checked,
        codexOverlay: document.getElementById("s-codexOverlay").checked,
        statusline: document.getElementById("s-statusline").checked,
        statusbar: document.getElementById("s-statusbar").checked,
      },
      themeMode: document.getElementById("themeMode").value,
      language: document.getElementById("language").value,
    };
  }

  function save() {
    vscode.postMessage({ type: "save", settings: readSettings() });
  }

  function openEarningsPortal() {
    vscode.postMessage({ type: "openEarningsPortal" });
  }
</script>
</body>
</html>`;
  }

  private renderSurfaceToggle(key: keyof SurfaceConfig, loc: Locale): string {
    const labelKey = `gptw.settings.surface${key.charAt(0).toUpperCase() + key.slice(1)}`;
    const descKey = labelKey + "Desc";
    return `<div class="row">
      <div class="row-label">
        <div>${this.escHtml(t(labelKey, {}, loc))}</div>
        <div class="desc">${this.escHtml(t(descKey, {}, loc))}</div>
      </div>
      <input type="checkbox" id="s-${key}" ${this.settings.surfaces[key] ? "checked" : ""}>
    </div>`;
  }

  private escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  dispose(): void {
    this.panel?.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
