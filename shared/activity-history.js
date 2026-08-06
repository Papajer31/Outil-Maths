const SNAPSHOT_TEXT_LIMIT = 12000;
const SNAPSHOT_FIELDS_LIMIT = 120;
const SNAPSHOT_CHOICES_LIMIT = 120;
const SNAPSHOT_MEDIA_LIMIT = 40;
const SNAPSHOT_JSON_LIMIT = 64 * 1024;
const CONFIG_JSON_LIMIT = 64 * 1024;

export const ACTIVITY_HISTORY_CONTEXTS = Object.freeze(["exploration", "adventure", "mission"]);
export const ACTIVITY_ATTEMPT_STATUSES = Object.freeze(["running", "completed", "interrupted", "abandoned"]);
export const ACTIVITY_QUESTION_OUTCOMES = Object.freeze(["correct", "incorrect", "unanswered"]);

export function normalizeActivityHistoryContext(value, fallback = "exploration") {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "aventure") return "adventure";
  if (ACTIVITY_HISTORY_CONTEXTS.includes(safe)) return safe;
  const safeFallback = String(fallback || "exploration").trim().toLowerCase();
  return ACTIVITY_HISTORY_CONTEXTS.includes(safeFallback) ? safeFallback : "exploration";
}

export function normalizeActivityAttemptStatus(value, fallback = "interrupted") {
  const safe = String(value || "").trim().toLowerCase();
  if (ACTIVITY_ATTEMPT_STATUSES.includes(safe)) return safe;
  return ACTIVITY_ATTEMPT_STATUSES.includes(fallback) ? fallback : "interrupted";
}

export function normalizeActivityQuestionOutcome(value, fallback = "unanswered") {
  const safe = String(value || "").trim().toLowerCase();
  if (ACTIVITY_QUESTION_OUTCOMES.includes(safe)) return safe;
  return ACTIVITY_QUESTION_OUTCOMES.includes(fallback) ? fallback : "unanswered";
}

export function createActivityAttemptClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (!bytes.some(Boolean)) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function captureActivityHistorySnapshot({ runtime = null, container = null, context = null, stage = "question" } = {}) {
  const safeStage = String(stage || "question").trim().toLowerCase() || "question";

  if (runtime && typeof runtime.getHistorySnapshot === "function") {
    try {
      const customSnapshot = runtime.getHistorySnapshot(safeStage, container, context);
      if (customSnapshot && typeof customSnapshot === "object" && !Array.isArray(customSnapshot)) {
        return normalizeSnapshot({
          version: 1,
          source: "tool",
          stage: safeStage,
          ...customSnapshot
        });
      }
    } catch (error) {
      console.warn("Instantané d’historique fourni par l’outil indisponible.", error);
    }
  }

  return captureDomFallbackSnapshot(container, safeStage);
}

export function normalizeHistoryJson(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return cloneJson(fallback);
  }
  return cloneJson(value);
}

export function createActivityHistoryConfigSnapshot(value) {
  const safe = normalizeHistoryJson(value, {});
  const serialized = safeJsonStringify(safe);
  if (serialized.length <= CONFIG_JSON_LIMIT) return safe;

  return {
    version: 1,
    truncated: true,
    originalLength: serialized.length,
    topLevelKeys: Object.keys(safe).slice(0, 120),
    summary: summarizeTopLevelValues(safe)
  };
}

function captureDomFallbackSnapshot(container, stage) {
  const root = typeof Element !== "undefined" && container instanceof Element ? container : null;
  if (!root) {
    return {
      version: 1,
      source: "dom-fallback",
      stage,
      text: "",
      fields: [],
      choices: [],
      media: [],
      canvases: []
    };
  }

  return normalizeSnapshot({
    version: 1,
    source: "dom-fallback",
    stage,
    text: normalizeVisibleText(root.innerText || root.textContent || ""),
    fields: collectFormFields(root),
    choices: collectChoices(root),
    media: collectMedia(root),
    canvases: collectCanvases(root)
  });
}

function collectFormFields(root) {
  return [...root.querySelectorAll("input, textarea, select")]
    .slice(0, SNAPSHOT_FIELDS_LIMIT)
    .map((element, index) => {
      const type = String(element.getAttribute("type") || element.tagName || "").toLowerCase();
      const value = element instanceof HTMLSelectElement
        ? [...element.selectedOptions].map((option) => option.textContent || option.value).join(" | ")
        : String(element.value ?? "");
      return compactObject({
        index,
        tag: element.tagName.toLowerCase(),
        type,
        name: cleanShortText(element.getAttribute("name") || "", 160),
        id: cleanShortText(element.id || "", 160),
        label: resolveElementLabel(element),
        value: cleanShortText(value, 2000),
        checked: "checked" in element ? element.checked === true : undefined,
        disabled: element.disabled === true || undefined
      });
    });
}

function collectChoices(root) {
  const candidates = root.querySelectorAll(
    "button, [role='button'], [role='option'], [role='radio'], [aria-pressed], [aria-selected], .is-selected, .selected, .is-correct, .is-incorrect"
  );
  return [...candidates]
    .slice(0, SNAPSHOT_CHOICES_LIMIT)
    .map((element, index) => compactObject({
      index,
      tag: element.tagName.toLowerCase(),
      id: cleanShortText(element.id || "", 160),
      text: cleanShortText(element.innerText || element.textContent || "", 1200),
      ariaLabel: cleanShortText(element.getAttribute("aria-label") || "", 600),
      pressed: normalizeBooleanAttribute(element.getAttribute("aria-pressed")),
      selected: normalizeBooleanAttribute(element.getAttribute("aria-selected")),
      checked: normalizeBooleanAttribute(element.getAttribute("aria-checked")),
      disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true" || undefined,
      classes: [...element.classList]
        .filter((className) => /(?:selected|correct|incorrect|active|choice|answer|response)/i.test(className))
        .slice(0, 12)
    }));
}

function collectMedia(root) {
  return [...root.querySelectorAll("img, audio, video, source")]
    .slice(0, SNAPSHOT_MEDIA_LIMIT)
    .map((element, index) => compactObject({
      index,
      tag: element.tagName.toLowerCase(),
      alt: cleanShortText(element.getAttribute("alt") || "", 800),
      title: cleanShortText(element.getAttribute("title") || "", 800),
      ariaLabel: cleanShortText(element.getAttribute("aria-label") || "", 800),
      src: sanitizeMediaSource(element.currentSrc || element.getAttribute("src") || "")
    }));
}

function sanitizeMediaSource(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^blob:/i.test(raw)) return "blob:temporary";
  if (/^data:/i.test(raw)) return "data:embedded";

  try {
    const base = typeof document !== "undefined" ? document.baseURI : "https://local.invalid/";
    const url = new URL(raw, base);
    url.search = "";
    url.hash = "";
    if (typeof location !== "undefined" && url.origin === location.origin) {
      return cleanShortText(`${url.pathname}`, 2000);
    }
    return cleanShortText(url.toString(), 2000);
  } catch {
    return cleanShortText(raw.split(/[?#]/, 1)[0], 2000);
  }
}

function collectCanvases(root) {
  return [...root.querySelectorAll("canvas")].slice(0, 20).map((canvas, index) => ({
    index,
    width: Math.max(0, Number(canvas.width) || 0),
    height: Math.max(0, Number(canvas.height) || 0),
    ariaLabel: cleanShortText(canvas.getAttribute("aria-label") || "", 800)
  }));
}

function resolveElementLabel(element) {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return cleanShortText(ariaLabel, 600);
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .filter(Boolean)
      .join(" ");
    if (text) return cleanShortText(text, 600);
  }
  if (element.id) {
    const escapedId = globalThis.CSS?.escape ? CSS.escape(element.id) : element.id.replace(/["\\]/g, "\\$&");
    const label = document.querySelector(`label[for="${escapedId}"]`);
    if (label?.textContent) return cleanShortText(label.textContent, 600);
  }
  return "";
}

function normalizeSnapshot(snapshot) {
  const safe = normalizeHistoryJson(snapshot, {});
  safe.version = Math.max(1, Math.trunc(Number(safe.version) || 1));
  safe.source = cleanShortText(safe.source || "unknown", 80);
  safe.stage = cleanShortText(safe.stage || "question", 80);
  if (typeof safe.text === "string") safe.text = normalizeVisibleText(safe.text);

  const serialized = safeJsonStringify(safe);
  if (serialized.length <= SNAPSHOT_JSON_LIMIT) return safe;

  return {
    version: safe.version,
    source: safe.source,
    stage: safe.stage,
    truncated: true,
    originalLength: serialized.length,
    text: typeof safe.text === "string" ? safe.text.slice(0, SNAPSHOT_TEXT_LIMIT) : "",
    topLevelKeys: Object.keys(safe).slice(0, 120)
  };
}

function normalizeVisibleText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, SNAPSHOT_TEXT_LIMIT);
}

function cleanShortText(value, maxLength) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(0, Number(maxLength) || 0));
}

function normalizeBooleanAttribute(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => (
    item !== undefined
    && item !== null
    && item !== ""
    && (!Array.isArray(item) || item.length > 0)
  )));
}

function summarizeTopLevelValues(value) {
  const summary = {};
  Object.entries(value).slice(0, 120).forEach(([key, item]) => {
    if (item == null || ["string", "number", "boolean"].includes(typeof item)) {
      summary[key] = typeof item === "string" ? item.slice(0, 500) : item;
      return;
    }
    if (Array.isArray(item)) {
      summary[key] = { type: "array", length: item.length };
      return;
    }
    if (typeof item === "object") {
      summary[key] = { type: "object", keys: Object.keys(item).slice(0, 40) };
    }
  });
  return summary;
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return "";
  }
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}
