import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync }
  from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import type { TargetAdapter, PreflightResult, OpResult, RestoreResult,
              PatchParams } from "../types";
import { sha256 } from "../../util/crypto";
import { resolveAsset } from "../../util/asset";
import { parseable, upsertPlugin, removePlugin, removeTopLevel }
  from "./settingsEdit";

const MARKER = "KICKBACKS-OPENCODE";
const AD_FILE_NAME = "opencode-ad.json";
const PLUGIN_FILE_NAME = "opencode-plugin.js";
const FRESH_MS = 10 * 60 * 1000;

// OpenCode config paths (platform-aware).
function opencodeConfigDir(): string {
  if (process.platform === "win32") {
    return join(homedir(), ".config", "opencode");
  }
  return join(homedir(), ".config", "opencode");
}

function opencodeConfigPath(): string {
  const dir = opencodeConfigDir();
  // Prefer .jsonc (the default OpenCode ships), fall back to .json.
  const jsonc = join(dir, "opencode.jsonc");
  if (existsSync(jsonc)) return jsonc;
  const json = join(dir, "opencode.json");
  if (existsSync(json)) return json;
  // Default: create .jsonc (the modern default).
  return jsonc;
}

/** Detect if OpenCode is installed by checking for its binary or config. */
function opencodeInstalled(): boolean {
  // Check for the config directory existing.
  if (existsSync(opencodeConfigDir())) return true;
  // Check for the binary in the standard install location.
  const binPath = join(homedir(), ".opencode", "bin",
    process.platform === "win32" ? "opencode.exe" : "opencode");
  return existsSync(binPath);
}

/** Strip terminal control characters before writing ad text to the cache. */
function stripControlChars(s: string): string {
  return s.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
}

/** Resolve the shipped plugin asset in BOTH unbundled (co-located src) and
 *  esbuild-bundled (dist/adapters/opencode/) layouts — mirrors the existing
 *  adapter resolveAsset contracts. */
export function resolvePluginAsset(baseDir: string): string {
  return resolveAsset(baseDir, "adapters/opencode", "plugin.asset.js");
}

/** Wraps OpenCode's native plugin system to inject Kickbacks-served ads
 *  into the TUI spinner/status display. Reversible: the plugin registration
 *  in opencode.jsonc is added on apply and removed on restore.
 *
 *  The adapter writes THREE things:
 *  1. ~/.vibe-ads/opencode-plugin.js — the plugin script (placeholders filled).
 *  2. ~/.vibe-ads/opencode-ad.json  — the current ad cache (re-read by plugin).
 *  3. opencode.jsonc "plugin" array  — registers the plugin path.
 *
 *  Restore removes (3) and cleans up (1) + (2). */
export class OpenCodeAdapter implements TargetAdapter {
  readonly name = "opencode";
  private readonly configPath: string;

  constructor() {
    this.configPath = opencodeConfigPath();
  }

  private vibeDir(): string { return join(homedir(), ".vibe-ads"); }
  private adFilePath(): string { return join(this.vibeDir(), AD_FILE_NAME); }
  private pluginPath(): string { return join(this.vibeDir(), PLUGIN_FILE_NAME); }
  private backupPath(): string { return this.configPath + ".kickbacks-backup"; }

  /** The plugin spec registered into the opencode.jsonc "plugin" array.
   *  OpenCode resolves file:// paths relative to the config dir; we use an
   *  absolute path to avoid ambiguity. */
  private pluginSpec(): string { return this.pluginPath(); }

  version(): string | null { return "opencode"; }

  preflight(): PreflightResult {
    try {
      if (!opencodeInstalled())
        return { ok: true, compatible: false, version: "opencode",
                 reason: "OpenCode not installed" };
      // If the config file exists, it must be parseable.
      if (existsSync(this.configPath)) {
        const src = readFileSync(this.configPath, "utf8");
        if (!parseable(src))
          return { ok: true, compatible: false, version: "opencode",
                   reason: "opencode.jsonc not parseable" };
      }
      return { ok: true, compatible: true, version: "opencode" };
    } catch (e) {
      return { ok: false, compatible: false, version: null, reason: String(e) };
    }
  }

  isPatched(): boolean {
    try {
      if (!existsSync(this.pluginPath())) return false;
      return readFileSync(this.pluginPath(), "utf8").includes(MARKER);
    } catch { return false; }
  }

  private renderPlugin(loopbackBase: string): string {
    const assetPath = resolvePluginAsset(dirname(__filename));
    return readFileSync(assetPath, "utf8")
      .split("__KICKBACKS_OC_AD_PATH__").join(JSON.stringify(this.adFilePath()))
      .split("__KICKBACKS_OC_FRESH_MS__").join(String(FRESH_MS))
      .split("__KICKBACKS_OC_LOOPBACK_BASE__").join(JSON.stringify(loopbackBase));
  }

  applyPatch(p: PatchParams): OpResult {
    try {
      // 1. Write/update the ad cache file (cheap, decoupled from plugin).
      mkdirSync(this.vibeDir(), { recursive: true });
      const adData = JSON.stringify({
        adText: stripControlChars(p.adText || "") || "Earning Kickback",
        clickUrl: p.clickUrl || "",
        adId: p.clickToken || "",
        campaignId: p.corr || "",
        ts: Date.now(),
      });
      writeFileSync(this.adFilePath(), adData, "utf8");

      // 2. Write the plugin script (idempotent: skip if byte-identical).
      const loopbackBase = p.loopbackBase || "";
      const pluginSrc = `// ${MARKER}\n` + this.renderPlugin(loopbackBase);
      if (!existsSync(this.pluginPath())
          || readFileSync(this.pluginPath(), "utf8") !== pluginSrc)
        writeFileSync(this.pluginPath(), pluginSrc, "utf8");

      // 3. Register the plugin in opencode.jsonc.
      mkdirSync(dirname(this.configPath), { recursive: true });
      const existed = existsSync(this.configPath);
      const pristine = existed
        ? readFileSync(this.configPath, "utf8") : null;
      if (pristine !== null && !parseable(pristine))
        return { ok: false, reason: "opencode.jsonc not parseable" };

      // Backup the original config (once).
      if (!existsSync(this.backupPath()))
        writeFileSync(this.backupPath(),
          pristine === null ? " KICKBACKS-ABSENT" : pristine, "utf8");

      const base = pristine ?? '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
      const next = upsertPlugin(base, this.pluginSpec());
      if (!existed || next !== pristine)
        writeFileSync(this.configPath, next, "utf8");

      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }

  restore(): RestoreResult {
    try {
      // KEY-SCOPED restore: only remove the plugin entry we added.
      // Never overwrite the whole file — the user may have added other
      // plugins, providers, models, etc. since we patched.
      if (existsSync(this.configPath)) {
        const cur = readFileSync(this.configPath, "utf8");
        if (!parseable(cur))
          return { ok: false, restored: false,
                   reason: "opencode.jsonc not parseable" };
        const next = removePlugin(cur, this.pluginSpec());
        if (next !== cur)
          writeFileSync(this.configPath, next, "utf8");
      }

      // Clean up plugin + ad cache files.
      if (existsSync(this.pluginPath())) {
        try { rmSync(this.pluginPath()); } catch { /* best-effort */ }
      }
      if (existsSync(this.adFilePath())) {
        try { rmSync(this.adFilePath()); } catch { /* best-effort */ }
      }

      // Remove backup.
      const bak = this.backupPath();
      if (existsSync(bak)) {
        try { rmSync(bak); } catch { /* best-effort */ }
      }

      return { ok: true, restored: true };
    } catch (e) {
      return { ok: false, restored: false, reason: String(e) };
    }
  }
}
