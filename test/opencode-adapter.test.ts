import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync }
  from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenCodeAdapter, resolvePluginAsset }
  from "../src/adapters/opencode/adapter";

const MARKER = "GPTW-OPENCODE";

let _fakeHomeDirs: string[] = [];
// The adapter resolves its config dir platform-awarely (APPDATA on win32,
// XDG_CONFIG_HOME / ~/.config elsewhere). Tests run on any host, so we pin
// XDG_CONFIG_HOME to the fake home and clear APPDATA to force the Unix-style
// ~/.config/opencode layout the rest of this suite asserts against.
let _savedAppData: string | undefined;
let _savedXdg: string | undefined;

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => _fakeHomeDirs[_fakeHomeDirs.length - 1] ?? actual.homedir(),
  };
});

function tmpHome(): string {
  const d = mkdtempSync(join(tmpdir(), "opencode-"));
  mkdirSync(join(d, ".config", "opencode"), { recursive: true });
  _fakeHomeDirs.push(d);
  return d;
}

function defaultConfig(home: string): string {
  const p = join(home, ".config", "opencode", "opencode.jsonc");
  const src = '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
  writeFileSync(p, src, "utf8");
  return p;
}

const params = {
  tier: 3 as const, adText: "Ramp corporate cards & expense mgmt",
  iconRef: "icon.r", iconUrl: "", clickToken: "ck", clickUrl: "https://ramp.example/lp", corr: "ad1.tst",
  loopbackPort: 5555, loopbackToken: "lt",
  loopbackBase: "",
};

describe("OpenCodeAdapter", () => {
  let home: string;

  beforeEach(() => {
    home = tmpHome();
    // Force the Unix-style ~/.config/opencode resolution regardless of host OS:
    // on win32 the adapter reads APPDATA first; clearing it falls through to the
    // homedir() mock. On non-win32, XDG_CONFIG_HOME is pinned to the fake .config.
    _savedAppData = process.env.APPDATA;
    _savedXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.APPDATA;
    process.env.XDG_CONFIG_HOME = join(home, ".config");
  });
  afterEach(() => {
    _fakeHomeDirs = [];
    if (_savedAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = _savedAppData;
    if (_savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = _savedXdg;
    try { rmSync(home, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("preflight compatible when opencode.jsonc exists", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    const pf = a.preflight();
    expect(pf.compatible).toBe(true);
    expect(pf.version).toBe("opencode");
  });

  it("preflight compatible when opencode.json exists (legacy)", () => {
    const d = join(home, ".config", "opencode");
    rmSync(join(d, "opencode.jsonc"), { force: true });
    writeFileSync(join(d, "opencode.json"), '{\n}\n', "utf8");
    const a = new OpenCodeAdapter();
    expect(a.preflight().compatible).toBe(true);
  });

  it("preflight incompatible when opencode not installed", () => {
    rmSync(join(home, ".config", "opencode"), { recursive: true, force: true });
    const a = new OpenCodeAdapter();
    const pf = a.preflight();
    expect(pf.compatible).toBe(false);
    expect(pf.reason).toContain("not installed");
  });

  it("preflight incompatible when config not parseable", () => {
    const d = join(home, ".config", "opencode");
    writeFileSync(join(d, "opencode.jsonc"), "{ invalid", "utf8");
    const a = new OpenCodeAdapter();
    const pf = a.preflight();
    expect(pf.compatible).toBe(false);
    expect(pf.reason).toContain("not parseable");
  });

  it("isPatched: false pristine, true after applyPatch, false after restore", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    expect(a.isPatched()).toBe(false);
    expect(a.applyPatch(params).ok).toBe(true);
    expect(a.isPatched()).toBe(true);
    expect(a.restore().restored).toBe(true);
    expect(a.isPatched()).toBe(false);
  });

  it("applyPatch writes the plugin script with MARKER", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    a.applyPatch(params);
    const plugin = readFileSync(join(home, ".gptw", "opencode-plugin.js"), "utf8");
    expect(plugin).toContain(MARKER);
    expect(plugin).toContain("opencode-ad.json");
  });

  it("applyPatch writes the ad cache", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    a.applyPatch(params);
    const ad = JSON.parse(
      readFileSync(join(home, ".gptw", "opencode-ad.json"), "utf8"));
    expect(ad.adText).toBe(params.adText);
    expect(ad.clickUrl).toBe(params.clickUrl);
    expect(typeof ad.ts).toBe("number");
  });

  it("applyPatch registers the plugin in opencode.jsonc", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    a.applyPatch(params);
    const cfg = readFileSync(join(home, ".config", "opencode", "opencode.jsonc"), "utf8");
    expect(cfg).toContain("plugin");
    expect(cfg).toContain("opencode-plugin.js");
  });

  it("applyPatch idempotent (byte-identical re-apply)", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    expect(a.applyPatch(params).ok).toBe(true);
    const after1 = readFileSync(
      join(home, ".gptw", "opencode-plugin.js"), "utf8");
    expect(a.applyPatch(params).ok).toBe(true);
    const after2 = readFileSync(
      join(home, ".gptw", "opencode-plugin.js"), "utf8");
    expect(after2).toBe(after1);
  });

  it("applyPatch creates config from scratch (no prior opencode.jsonc)", () => {
    const d = join(home, ".config", "opencode");
    rmSync(join(d, "opencode.jsonc"), { force: true });
    rmSync(join(d, "opencode.json"), { force: true });
    const a = new OpenCodeAdapter();
    expect(a.applyPatch(params).ok).toBe(true);
    expect(existsSync(join(d, "opencode.jsonc"))).toBe(true);
    const cfg = readFileSync(join(d, "opencode.jsonc"), "utf8");
    expect(cfg).toContain("plugin");
  });

  it("restore removes the plugin entry from opencode.jsonc", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    a.applyPatch(params);
    expect(a.restore().restored).toBe(true);
    const cfg = readFileSync(
      join(home, ".config", "opencode", "opencode.jsonc"), "utf8");
    expect(cfg).not.toContain("opencode-plugin.js");
  });

  it("restore cleans up plugin + ad cache files", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    a.applyPatch(params);
    expect(existsSync(join(home, ".gptw", "opencode-plugin.js"))).toBe(true);
    expect(existsSync(join(home, ".gptw", "opencode-ad.json"))).toBe(true);
    a.restore();
    expect(existsSync(join(home, ".gptw", "opencode-plugin.js"))).toBe(false);
    expect(existsSync(join(home, ".gptw", "opencode-ad.json"))).toBe(false);
  });

  it("restore is safe when no backup present (best-effort cleanup)", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    const r = a.restore();
    expect(r.ok).toBe(true);
    expect(r.restored).toBe(true); // always restored=true; best-effort
  });

  it("fallback ad text when adText strips to empty", () => {
    defaultConfig(home);
    const a = new OpenCodeAdapter();
    const p = { ...params, adText: "\u001b\u0007" };
    a.applyPatch(p);
    const ad = JSON.parse(
      readFileSync(join(home, ".gptw", "opencode-ad.json"), "utf8"));
    expect(ad.adText).toBe("Earning GPTW");
  });

  it("resolvePluginAsset finds the unbundled layout", () => {
    const base = join(__dirname, "..", "src");
    expect(existsSync(resolvePluginAsset(base))).toBe(true);
  });
});
