import * as vscode from "vscode";

export type ThemeKind = "light" | "dark" | "highContrast";

export interface ThemeColors {
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  overlayBg: string;
  overlayBorder: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
}

const DARK: ThemeColors = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  mutedForeground: "#858585",
  border: "#404040",
  overlayBg: "rgba(30,30,30,0.95)",
  overlayBorder: "#404040",
  accent: "#3794ff",
  success: "#2ea043",
  warning: "#d29922",
  error: "#f85149",
};

const LIGHT: ThemeColors = {
  background: "#ffffff",
  foreground: "#383838",
  mutedForeground: "#6e6e6e",
  border: "#d4d4d4",
  overlayBg: "rgba(255,255,255,0.95)",
  overlayBorder: "#d4d4d4",
  accent: "#0066bf",
  success: "#1a7f37",
  warning: "#9a6700",
  error: "#cf222e",
};

const HIGH_CONTRAST: ThemeColors = {
  background: "#000000",
  foreground: "#ffffff",
  mutedForeground: "#cccccc",
  border: "#6fc3df",
  overlayBg: "rgba(0,0,0,0.97)",
  overlayBorder: "#6fc3df",
  accent: "#3794ff",
  success: "#2ea043",
  warning: "#d29922",
  error: "#f85149",
};

export function detectThemeKind(): ThemeKind {
  try {
    const kind = vscode.window.activeColorTheme.kind;
    switch (kind) {
      case vscode.ColorThemeKind.Light: return "light";
      case vscode.ColorThemeKind.HighContrast: return "highContrast";
      default: return "dark";
    }
  } catch {
    return "dark";
  }
}

export function getThemeColors(kind?: ThemeKind): ThemeColors {
  const k = kind ?? detectThemeKind();
  switch (k) {
    case "light": return { ...LIGHT };
    case "highContrast": return { ...HIGH_CONTRAST };
    default: return { ...DARK };
  }
}

export function generateOverlayCSSVars(kind?: ThemeKind): string {
  const c = getThemeColors(kind);
  return [
    `--gptw-bg: ${c.overlayBg};`,
    `--gptw-fg: ${c.foreground};`,
    `--gptw-muted: ${c.mutedForeground};`,
    `--gptw-border: ${c.overlayBorder};`,
    `--gptw-accent: ${c.accent};`,
    `--gptw-success: ${c.success};`,
  ].join("\n");
}

export function onDidChangeTheme(
  cb: (kind: ThemeKind) => void,
  ctx: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.window.onDidChangeActiveColorTheme((e) => {
    let kind: ThemeKind;
    switch (e.kind) {
      case vscode.ColorThemeKind.Light: kind = "light"; break;
      case vscode.ColorThemeKind.HighContrast: kind = "highContrast"; break;
      default: kind = "dark"; break;
    }
    cb(kind);
  }, null, ctx.subscriptions);
}
