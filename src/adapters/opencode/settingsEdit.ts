/** Minimal-edit, JSONC-tolerant editing of opencode.jsonc.
 *  Mirrors the claude-cli/settingsEdit contract: raw-text mutations so
 *  the user's comments, whitespace, and key order survive. */

type Ctx = "code" | "str" | "line" | "block";

/** Strip JSONC comments + a single trailing comma before } or ] so we can
 *  validate with JSON.parse. Used ONLY for parse/idempotency checks, never
 *  for the emitted text. */
function stripJsonc(src: string): string {
  let out = "", ctx: Ctx = "code", i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (ctx === "code") {
      if (c === '"') { ctx = "str"; out += c; i++; continue; }
      if (c === "/" && n === "/") { ctx = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { ctx = "block"; i += 2; continue; }
      out += c; i++; continue;
    }
    if (ctx === "str") {
      out += c;
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (c === '"') ctx = "code";
      i++; continue;
    }
    if (ctx === "line") { if (c === "\n") { ctx = "code"; out += c; } i++; continue; }
    // block
    if (c === "*" && n === "/") { ctx = "code"; i += 2; continue; }
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseable(src: string): boolean {
  try { JSON.parse(stripJsonc(src)); return true; } catch { return false; }
}

/** Find the [start,end) raw-text span of the VALUE of a top-level `key`, or
 *  null if the key is absent. Comment/string aware; only depth-1 keys match. */
function findTopLevelValueSpan(src: string, key: string): [number, number] | null {
  if (!parseable(src)) throw new Error("opencode.jsonc not parseable");
  let ctx: Ctx = "code", depth = 0, i = 0;
  let pendingKey: string | null = null, keyStart = -1;
  const skipWs = (j: number): number => {
    let c2: Ctx = "code";
    while (j < src.length) {
      const c = src[j], n = src[j + 1];
      if (c2 === "code") {
        if (c === "/" && n === "/") { c2 = "line"; j += 2; continue; }
        if (c === "/" && n === "*") { c2 = "block"; j += 2; continue; }
        if (/\s/.test(c) || c === ":") { j++; continue; }
        return j;
      }
      if (c2 === "line") { if (c === "\n") c2 = "code"; j++; continue; }
      if (c === "*" && n === "/") { c2 = "code"; j += 2; continue; }
      j++;
    }
    return j;
  };
  const valueEnd = (j: number): number => {
    let c2: Ctx = "code", d = 0;
    for (; j < src.length; j++) {
      const c = src[j], n = src[j + 1];
      if (c2 === "str") {
        if (c === "\\") { j++; continue; }
        if (c === '"') c2 = "code";
        continue;
      }
      if (c2 === "line") { if (c === "\n") c2 = "code"; continue; }
      if (c2 === "block") { if (c === "*" && n === "/") { c2 = "code"; j++; } continue; }
      if (c === '"') { c2 = "str"; continue; }
      if (c === "/" && n === "/") { c2 = "line"; j++; continue; }
      if (c === "/" && n === "*") { c2 = "block"; j++; continue; }
      if (c === "{" || c === "[") d++;
      else if (c === "}" || c === "]") { if (d === 0) return j; d--; }
      else if ((c === ",") && d === 0) return j;
    }
    return j;
  };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (ctx === "str") {
      if (c === "\\") { i += 2; continue; }
      if (c === '"') {
        ctx = "code";
        if (depth === 1) pendingKey = src.slice(keyStart + 1, i);
      }
      i++; continue;
    }
    if (ctx === "line") { if (c === "\n") ctx = "code"; i++; continue; }
    if (ctx === "block") { if (c === "*" && n === "/") { ctx = "code"; i += 2; continue; } i++; continue; }
    if (c === "/" && n === "/") { ctx = "line"; i += 2; continue; }
    if (c === "/" && n === "*") { ctx = "block"; i += 2; continue; }
    if (c === '"') { ctx = "str"; keyStart = i; i++; continue; }
    if (c === "{" || c === "[") { depth++; i++; continue; }
    if (c === "}" || c === "]") { depth--; i++; continue; }
    if (c === ":" && depth === 1 && pendingKey === key) {
      const vs = skipWs(i + 1);
      return [vs, valueEnd(vs)];
    }
    if (c === ",") pendingKey = null;
    i++;
  }
  return null;
}

/** Set the top-level `key` to `valueJson` (a JSON value string), editing only
 *  that span. Inserts the key right after the root `{` when absent.
 *  Idempotent. Throws if `src` is not parseable JSONC. */
function upsertTopLevel(src: string, key: string, valueJson: string): string {
  const span = findTopLevelValueSpan(src, key);
  if (span) {
    return src.slice(0, span[0]) + valueJson + src.slice(span[1]);
  }
  const brace = src.indexOf("{");
  if (brace < 0) throw new Error("opencode.jsonc not parseable");
  const after = src.slice(brace + 1);
  const hasKeys = parseable(src) && /\S/.test(stripJsonc(after).replace(/[}\s]/g, ""));
  const insert = `\n  ${JSON.stringify(key)}: ${valueJson}${hasKeys ? "," : ""}`;
  return src.slice(0, brace + 1) + insert + after;
}

/** Remove a top-level key (and its trailing/leading comma) from a JSONC
 *  settings file. Idempotent — returns `src` unchanged when absent. */
export function removeTopLevel(src: string, key: string): string {
  let span: [number, number] | null;
  try { span = findTopLevelValueSpan(src, key); }
  catch { return src; }
  if (!span) return src;
  let s = span[0];
  while (s > 0 && /\s/.test(src[s - 1])) s--;
  if (s > 0 && src[s - 1] === ":") s--;
  while (s > 0 && /\s/.test(src[s - 1])) s--;
  if (s > 0 && src[s - 1] === '"') {
    let q = s - 2;
    while (q > 0) {
      if (src[q] === '"' && src[q - 1] !== "\\") break;
      q--;
    }
    s = q;
  }
  let e = span[1];
  let trailingCommaConsumed = false;
  let j = e;
  while (j < src.length && /\s/.test(src[j])) j++;
  if (src[j] === ",") { e = j + 1; trailingCommaConsumed = true; }
  if (trailingCommaConsumed) {
    while (s > 0 && /\s/.test(src[s - 1])) s--;
  }
  if (!trailingCommaConsumed) {
    let k = s;
    while (k > 0 && /\s/.test(src[k - 1])) k--;
    if (k > 0 && src[k - 1] === ",") s = k - 1;
  }
  return src.slice(0, s) + src.slice(e);
}

/** Upsert a plugin entry into the opencode.jsonc "plugin" array. Appends
 *  the plugin spec string if not already present. If the "plugin" key
 *  does not exist, creates it. */
export function upsertPlugin(src: string, pluginSpec: string): string {
  // First, check if the plugin spec is already referenced.
  // Parse the stripped JSONC to read the current plugin array.
  const obj = JSON.parse(stripJsonc(src)) as Record<string, unknown>;
  const plugins = (obj.plugin ?? []) as (string | [string, unknown])[];
  const exists = plugins.some((p) =>
    (typeof p === "string" ? p : p[0]) === pluginSpec);
  if (exists) return src;
  // Build the new array value.
  const newArr = [...plugins, pluginSpec];
  const valueJson = JSON.stringify(newArr);
  return upsertTopLevel(src, "plugin", valueJson);
}

/** Remove a plugin entry from the opencode.jsonc "plugin" array. If removing
 *  the entry would leave an empty array, remove the "plugin" key entirely. */
export function removePlugin(src: string, pluginSpec: string): string {
  const obj = JSON.parse(stripJsonc(src)) as Record<string, unknown>;
  const plugins = (obj.plugin ?? []) as (string | [string, unknown])[];
  const filtered = plugins.filter((p) =>
    (typeof p === "string" ? p : p[0]) !== pluginSpec);
  if (filtered.length === plugins.length) return src; // not present
  if (filtered.length === 0) return removeTopLevel(src, "plugin");
  return upsertTopLevel(src, "plugin", JSON.stringify(filtered));
}
