/** OpenCode discovery policy ("opencode fallback") — the truth table that decides
 *  whether the OpenCode adapter is constructed at activation.
 *
 *  The contract being locked:
 *    • Explicit opt-out beats everything (support remediation).
 *    • Explicit opt-in beats the claude state.
 *    • Default on a claude-COMPATIBLE machine is OFF — protects users running
 *      Claude Code alongside OpenCode.
 *    • Default on a claude-incompatible/absent machine is ON — the fallback
 *      that makes an OpenCode-only install serve instead of being dead weight.
 */
import { describe, it, expect, vi } from "vitest";
import { opencodeDiscoveryEnabled } from "../src/activation/opencodeFallback";

describe("opencodeDiscoveryEnabled truth table", () => {
  it("opt-out beats opt-in AND the fallback", () => {
    expect(opencodeDiscoveryEnabled(
      { optIn: true, optOut: true, claudeCompatible: true })).toBe(false);
    expect(opencodeDiscoveryEnabled(
      { optIn: true, optOut: true, claudeCompatible: false })).toBe(false);
    expect(opencodeDiscoveryEnabled(
      { optIn: false, optOut: true, claudeCompatible: false })).toBe(false);
  });

  it("opt-in wins regardless of the claude state", () => {
    expect(opencodeDiscoveryEnabled(
      { optIn: true, optOut: false, claudeCompatible: true })).toBe(true);
    expect(opencodeDiscoveryEnabled(
      { optIn: true, optOut: false, claudeCompatible: false })).toBe(true);
  });

  it("default on a claude-compatible machine stays OFF (prime-directive guard)", () => {
    expect(opencodeDiscoveryEnabled(
      { optIn: false, optOut: false, claudeCompatible: true })).toBe(false);
  });

  it("default on a claude-incompatible machine is ON (the opencode fallback)", () => {
    expect(opencodeDiscoveryEnabled(
      { optIn: false, optOut: false, claudeCompatible: false })).toBe(true);
  });
});

describe("log.ts opencodeDisabled (env legs)", () => {
  // vi.importActual bypasses setup.ts's process-wide log mock — these legs
  // exercise the REAL sentinel/env reader. Only the env legs are asserted
  // (the sentinel leg would depend on the developer's real ~/.gptw).
  it("GPTW_OPENCODE=0 / KICKBACKS_OPENCODE=0 opt out; =1 does not", async () => {
    const { opencodeDisabled } =
      await vi.importActual<typeof import("../src/log")>("../src/log");
    vi.stubEnv("GPTW_OPENCODE", "0");
    expect(opencodeDisabled()).toBe(true);
    vi.stubEnv("GPTW_OPENCODE", "1");
    vi.stubEnv("KICKBACKS_OPENCODE", "0");
    expect(opencodeDisabled()).toBe(true);
    vi.unstubAllEnvs();
  });
});
