/** OpenCode discovery policy ("opencode fallback").
 *
 *  OpenCode targeting turns on when the user opted in, OR when there is no
 *  compatible Claude Code target on this machine. Where no Claude Code exists
 *  there is nothing of ours to break — and without the fallback, GPTW on an
 *  OpenCode-only machine is dead weight: a red "incompatible" status bar, no
 *  sign-in, no serving.
 *
 *  An explicit opt-out always wins (support remediation: opencode.disabled
 *  sentinel / GPTW_OPENCODE=0 — see log.ts::opencodeDisabled).
 *
 *  Pure on purpose: no fs/env reads here. extension.ts composes the inputs
 *  (log.ts opt-in/opt-out primitives + the Claude adapter preflight), so the
 *  whole policy is unit-testable as a truth table. */
export function opencodeDiscoveryEnabled(i: {
  optIn: boolean;
  optOut: boolean;
  claudeCompatible: boolean;
}): boolean {
  if (i.optOut) return false;
  if (i.optIn) return true;
  return !i.claudeCompatible;
}
