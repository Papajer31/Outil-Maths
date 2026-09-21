import { isIntrinsicCatalogActivity, normalizeCatalogActivity } from "../../../shared/catalogue.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const LEVELS = [1, 2, 3, 4, 5];
const QR_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
let qrScriptPromise = null;

export async function openDirectLaunchDialog({
  teacherSpaceId,
  sourceType,
  source,
  saveDirectLaunchLinkForSpace,
  showToast
} = {}) {
  const type = ["catalog_activity", "teacher_activity", "sequence"].includes(String(sourceType || ""))
    ? String(sourceType)
    : "";
  const sourceId = getSourceId(source);
  if (!teacherSpaceId || !type || !sourceId) {
    showToast?.("Impossible de créer ce lien direct.", { isError:true });
    return;
  }

  const title = getSourceTitle(source);
  const isSequence = type === "sequence";
  const adaptiveAvailable = !isSequence && isAdaptiveAvailable(type, source);
  const intrinsic = isSequence || isSourceIntrinsic(type, source);
  let difficulty = adaptiveAvailable ? "adaptive" : "3";
  let executionMode = intrinsic ? "intrinsic" : "questions";
  let executionValue = executionMode === "time" ? 300 : 5;
  let currentLink = null;

  const overlay = document.createElement("div");
  overlay.className = "modal direct-launch-dialog";
  overlay.innerHTML = `
    <section class="modal-content" role="dialog" aria-modal="true" aria-labelledby="directLaunchTitle">
      <div class="modal-title" id="directLaunchTitle">QR / lien direct</div>
      <div class="direct-launch-resource-title">${escapeHtml(title)}</div>
      <div data-direct-launch-settings></div>
      <div class="direct-launch-result" data-direct-launch-result>
        <div class="dashboard-muted-text">Création du lien…</div>
      </div>
      <div class="modal-actions">
        <div class="modal-message" data-direct-launch-message></div>
        <button class="btn" type="button" data-action="close">Fermer</button>
      </div>
    </section>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest('[data-action="close"]')) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  renderSettings();
  await refreshLink();

  function renderSettings() {
    const host = overlay.querySelector("[data-direct-launch-settings]");
    if (!host) return;
    host.innerHTML = isSequence ? "" : `
      <div class="activity-assignment-field-row">
        <label class="dashboard-field-label" for="directLaunchDifficulty">Difficulté</label>
        <select id="directLaunchDifficulty" class="student-select">
          ${adaptiveAvailable
            ? `<option value="adaptive"${difficulty === "adaptive" ? " selected" : ""}>Adaptative</option>${LEVELS.map((level) => `<option value="${level}"${difficulty === String(level) ? " selected" : ""}>N${level}</option>`).join("")}`
            : `<option value="3" selected>Unique</option>`}
        </select>
      </div>
      ${intrinsic ? `
        <div class="activity-assignment-field-row">
          <span class="dashboard-field-label">Questions / Temps</span>
          <span>Contenu complet</span>
        </div>
      ` : `
        <div class="activity-assignment-field-row">
          <label class="dashboard-field-label" for="directLaunchExecutionMode">Questions / Temps</label>
          <select id="directLaunchExecutionMode" class="student-select">
            <option value="questions"${executionMode === "questions" ? " selected" : ""}>Questions</option>
            <option value="time"${executionMode === "time" ? " selected" : ""}>Temps</option>
          </select>
          <input id="directLaunchExecutionValue" class="modal-text-input activity-assignment-limit-value" type="number" min="1" max="${executionMode === "time" ? 120 : 200}" value="${escapeAttr(executionMode === "time" ? Math.max(1, Math.round(executionValue / 60)) : executionValue)}">
          <span>${executionMode === "time" ? "min" : "questions"}</span>
        </div>
      `}
    `;

    host.querySelector("#directLaunchDifficulty")?.addEventListener("change", async (event) => {
      difficulty = String(event.target?.value || "3");
      await refreshLink();
    });
    host.querySelector("#directLaunchExecutionMode")?.addEventListener("change", async (event) => {
      executionMode = String(event.target?.value || "questions") === "time" ? "time" : "questions";
      executionValue = executionMode === "time" ? 300 : 5;
      renderSettings();
      await refreshLink();
    });
    host.querySelector("#directLaunchExecutionValue")?.addEventListener("change", async (event) => {
      const raw = Math.max(1, Math.trunc(Number(event.target?.value) || 1));
      executionValue = executionMode === "time" ? raw * 60 : raw;
      await refreshLink();
    });
  }

  async function refreshLink() {
    const result = overlay.querySelector("[data-direct-launch-result]");
    const message = overlay.querySelector("[data-direct-launch-message]");
    if (message) {
      message.textContent = "";
      message.classList.remove("is-error");
    }
    if (result) result.innerHTML = `<div class="dashboard-muted-text">Création du lien…</div>`;

    try {
      const adaptive = !isSequence && difficulty === "adaptive";
      currentLink = await saveDirectLaunchLinkForSpace?.(teacherSpaceId, {
        source_type:type,
        source_id:sourceId,
        title_snapshot:title,
        difficulty_mode:adaptive ? "adaptive" : "fixed",
        difficulty_level:adaptive ? null : Math.max(1, Math.min(5, Number(difficulty) || 3)),
        execution_limit_mode:isSequence || intrinsic ? "intrinsic" : executionMode,
        execution_limit_value:isSequence || intrinsic ? null : executionValue
      });
      const token = String(currentLink?.token || "").trim();
      if (!token) throw new Error("Lien direct introuvable.");
      const url = buildStudentLaunchUrl(token);
      renderResult(url);
    } catch (error) {
      if (result) result.innerHTML = "";
      if (message) {
        message.textContent = error?.message || "Impossible de créer le lien direct.";
        message.classList.add("is-error");
      }
    }
  }

  async function renderResult(url) {
    const result = overlay.querySelector("[data-direct-launch-result]");
    if (!result) return;
    result.innerHTML = `
      <div class="direct-launch-qr" data-direct-launch-qr aria-label="QR code de lancement"></div>
      <div class="direct-launch-url-row">
        <input class="modal-text-input" type="text" readonly value="${escapeAttr(url)}" data-direct-launch-url>
        <button class="btn dashboard-btn-with-icon" type="button" data-action="copy-link">
          <span class="dashboard-material-icon" aria-hidden="true">content_copy</span>
          <span>Copier le lien</span>
        </button>
      </div>
      <div class="dashboard-muted-text">Le QR lance directement cette ressource, sans attribution ni identification d’élève.</div>
    `;
    result.querySelector('[data-action="copy-link"]')?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
        showToast?.("Lien copié.");
      } catch {
        const input = result.querySelector("[data-direct-launch-url]");
        input?.select?.();
        try { document.execCommand("copy"); showToast?.("Lien copié."); } catch {}
      }
    });

    try {
      await ensureQrLibrary();
      const qrHost = result.querySelector("[data-direct-launch-qr]");
      if (!qrHost || typeof window.QRCode !== "function") return;
      qrHost.innerHTML = "";
      new window.QRCode(qrHost, {
        text:url,
        width:256,
        height:256,
        correctLevel:window.QRCode.CorrectLevel?.M
      });
    } catch {
      const qrHost = result.querySelector("[data-direct-launch-qr]");
      if (qrHost) qrHost.innerHTML = `<div class="dashboard-muted-text">QR indisponible. Le lien reste utilisable.</div>`;
    }
  }
}

function ensureQrLibrary() {
  if (typeof window.QRCode === "function") return Promise.resolve();
  if (qrScriptPromise) return qrScriptPromise;
  qrScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${QR_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once:true });
      existing.addEventListener("error", reject, { once:true });
      return;
    }
    const script = document.createElement("script");
    script.src = QR_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Bibliothèque QR indisponible."));
    document.head.appendChild(script);
  });
  return qrScriptPromise;
}

function buildStudentLaunchUrl(token) {
  const page = new URL("../index.html", window.location.href);
  page.hash = `/launch?token=${encodeURIComponent(token)}`;
  return page.href;
}

function getSourceId(source) {
  return String(source?.id || source?.catalog_activity_id || "").trim();
}

function getSourceTitle(source) {
  return String(source?.config_name || source?.title || "Activité").trim() || "Activité";
}

function isAdaptiveAvailable(type, source) {
  if (type === "catalog_activity") return true;
  if (type === "teacher_activity") return String(source?.difficulty_mode || "single") === "adaptive";
  return false;
}

function isSourceIntrinsic(type, source) {
  if (type === "sequence") return true;
  const runtimeSource = type === "teacher_activity" ? teacherActivityToCatalogShape(source) : normalizeCatalogActivity(source);
  return isIntrinsicCatalogActivity(runtimeSource);
}

function teacherActivityToCatalogShape(activity = {}) {
  const adaptive = String(activity?.difficulty_mode || "single") === "adaptive";
  const config = isPlainObject(activity?.config_json) ? activity.config_json : {};
  const single = isPlainObject(config.level) ? config.level : {};
  const levels = adaptive && isPlainObject(activity?.levels_json)
    ? activity.levels_json
    : Object.fromEntries(LEVELS.map((level) => [String(level), clone(single)]));
  return normalizeCatalogActivity({
    id:`teacher-activity.${String(activity?.id || "")}`,
    config_name:getSourceTitle(activity),
    title:getSourceTitle(activity),
    tool_id:String(config.tool_id || "").trim(),
    levels_json:levels,
    status:"published",
    default_visible:true
  });
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
