// GPTW OpenCode plugin asset. Shipped raw (placeholders substituted at
// install time by the adapter). Runs inside the OpenCode plugin host.
// Pure: reads a local ad cache file and injects into the TUI via plugin hooks.
// No bundling — this file is copied as-is into ~/.gptw/opencode-plugin.js.

const { readFileSync, existsSync } = require("node:fs");

const AD_CACHE_PATH = __GPTW_OC_AD_PATH__;
const FRESH_MS = __GPTW_OC_FRESH_MS__;
const LOOPBACK_BASE = __GPTW_OC_LOOPBACK_BASE__;

/** Read the ad cache file. Returns null if stale/missing. */
function readAd() {
  try {
    if (!existsSync(AD_CACHE_PATH)) return null;
    const o = JSON.parse(readFileSync(AD_CACHE_PATH, "utf8"));
    if (!o || typeof o.ts !== "number") return null;
    if (Date.now() - o.ts > FRESH_MS) return null;
    if (typeof o.adText !== "string" || !o.adText) return null;
    return o;
  } catch { return null; }
}

/** Strip terminal control characters (C0 + DEL + C1). Emoji / unicode / URLs
 *  pass through untouched. */
function strip(s) {
  return s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

/** Fire-and-forget metric ping to the GPTW loopback server. */
function sendMetric(event, ad) {
  if (!LOOPBACK_BASE || !ad) return;
  try {
    const url = LOOPBACK_BASE + "/" + event;
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        adId: ad.adId || "",
        campaignId: ad.campaignId || "",
        surface: "opencode-tui",
        ts: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch { /* prime directive: never break the host */ }
}

// ─── Server-side plugin (runs in the OpenCode backend process) ───
/** @type {import("@opencode-ai/plugin").Plugin} */
const server = async (input) => {
  let lastImpressionAdId = "";
  return {
    // Track when the agent starts working (a tool is about to execute).
    // This is the closest "thinking" signal available in the plugin API.
    "tool.execute.before": async (_inp, _out) => {
      const ad = readAd();
      if (!ad) return;
      // Fire an impression only once per ad rotation (not per tool call).
      if (ad.adId !== lastImpressionAdId) {
        lastImpressionAdId = ad.adId;
        sendMetric("impression", ad);
      }
    },
    event: async ({ event }) => {
      // On session completion or message events, we could track viewership.
      // For now this is a placeholder for future view_tick / threshold logic.
    },
  };
};

module.exports = { server };
