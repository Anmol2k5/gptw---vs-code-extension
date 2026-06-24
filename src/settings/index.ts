import * as vscode from "vscode";
import type { Locale } from "../util/i18n";
import type { ThemeKind } from "../util/theme";

export interface SurfaceConfig {
  overlay: boolean;
  banner: boolean;
  codexOverlay: boolean;
  statusline: boolean;
  statusbar: boolean;
}

export interface GptwSettings {
  adEnabled: boolean;
  frequency: number;
  surfaces: SurfaceConfig;
  themeMode: "auto" | ThemeKind;
  language: Locale;
}

const DEFAULTS: GptwSettings = {
  adEnabled: true,
  frequency: 1,
  surfaces: {
    overlay: true,
    banner: true,
    codexOverlay: true,
    statusline: true,
    statusbar: false,
  },
  themeMode: "auto",
  language: "en",
};

const CONFIG_SECTION = "gptw";
const GLOBAL_STATE_KEY = "gptw.settings";

export function loadSettings(ctx: vscode.ExtensionContext): GptwSettings {
  const stored = ctx.globalState.get<Partial<GptwSettings>>(GLOBAL_STATE_KEY);
  const vs = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    adEnabled: stored?.adEnabled ?? vs.get<boolean>("adEnabled", DEFAULTS.adEnabled),
    frequency: stored?.frequency ?? vs.get<number>("frequency", DEFAULTS.frequency),
    surfaces: {
      overlay: stored?.surfaces?.overlay ?? vs.get<boolean>("surfaceOverlay", DEFAULTS.surfaces.overlay),
      banner: stored?.surfaces?.banner ?? vs.get<boolean>("surfaceBanner", DEFAULTS.surfaces.banner),
      codexOverlay: stored?.surfaces?.codexOverlay ?? vs.get<boolean>("surfaceCodex", DEFAULTS.surfaces.codexOverlay),
      statusline: stored?.surfaces?.statusline ?? vs.get<boolean>("surfaceStatusline", DEFAULTS.surfaces.statusline),
      statusbar: stored?.surfaces?.statusbar ?? vs.get<boolean>("surfaceStatusbar", DEFAULTS.surfaces.statusbar),
    },
    themeMode: stored?.themeMode ?? DEFAULTS.themeMode,
    language: stored?.language ?? DEFAULTS.language,
  };
}

export function saveSettings(ctx: vscode.ExtensionContext, s: GptwSettings): void {
  void ctx.globalState.update(GLOBAL_STATE_KEY, s);
}

export function isSurfaceEnabled(s: GptwSettings, surface: keyof SurfaceConfig): boolean {
  return s.adEnabled && s.surfaces[surface];
}
