import { isIntrinsicCatalogActivity, normalizeCatalogActivity } from "../../../shared/catalogue.js";
import { bindStepperField, renderStepperField } from "../../../shared/config-widgets.js";
import { renderMaterialIcon, setMaterialIcon } from "../../../shared/material-icons-svg.js";
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
  let refreshId = 0;
  const previouslyFocused = document.activeElement;

  const overlay = document.createElement("div");
  overlay.className = "modal direct-launch-dialog";
  overlay.innerHTML = `
    <section class="modal-content direct-launch-card" role="dialog" aria-modal="true" aria-labelledby="directLaunchTitle" tabindex="-1">
      <header class="direct-launch-header">
        <h2 class="modal-title" id="directLaunchTitle">
          ${renderMaterialIcon("devices", { className:"dashboard-material-icon" })}
          <span>Accès par QR code</span>
        </h2>
        <button class="direct-launch-close" type="button" data-action="close" aria-label="Fermer">
          ${renderMaterialIcon("close", { className:"dashboard-material-icon" })}
        </button>
      </header>

      <div class="direct-launch-body">
        <section class="direct-launch-preview" aria-label="QR code de lancement">
          <div class="direct-launch-qr-frame">
            <div class="direct-launch-qr" data-direct-launch-qr role="img" aria-label="QR code en cours de création">
              ${renderLoadingState("Création du QR code…")}
            </div>
          </div>
          <button class="btn direct-launch-download-btn dashboard-btn-with-icon" type="button" data-action="download-qr" disabled>
            ${renderMaterialIcon("download", { className:"dashboard-material-icon" })}
            <span>Télécharger le QR</span>
          </button>
        </section>

        <section class="direct-launch-details" aria-label="Réglages du lien direct">
          <div class="direct-launch-resource">
            <span class="direct-launch-resource-icon" aria-hidden="true">
              ${renderMaterialIcon(isSequence ? "quiz" : "school", { className:"dashboard-material-icon" })}
            </span>
            <span class="direct-launch-resource-copy">
              <span class="direct-launch-resource-label">${isSequence ? "Séquence" : "Activité"}</span>
              <strong class="direct-launch-resource-title">${escapeHtml(title)}</strong>
            </span>
          </div>

          <div class="direct-launch-settings">
            <div class="direct-launch-section-title">
              <span>Réglages de lancement</span>
            </div>
            <div data-direct-launch-settings></div>
          </div>

          <div class="direct-launch-result" data-direct-launch-result aria-live="polite">
            ${renderLoadingState("Création du lien…")}
          </div>
          <div class="modal-message direct-launch-message" data-direct-launch-message></div>
        </section>
      </div>
    </section>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    refreshId += 1;
    overlay.remove();
    previouslyFocused?.focus?.();
  };
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest('[data-action="close"]')) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  overlay.querySelector('[data-action="download-qr"]')?.addEventListener("click", () => {
    downloadQrCode(overlay.querySelector("[data-direct-launch-qr]"), title, showToast);
  });

  renderSettings();
  overlay.querySelector(".direct-launch-card")?.focus({ preventScroll:true });
  await refreshLink();

  function renderSettings() {
    const host = overlay.querySelector("[data-direct-launch-settings]");
    if (!host) return;
    const amount = executionMode === "time"
      ? Math.max(1, Math.round(executionValue / 60))
      : executionValue;
    const amountMax = executionMode === "time" ? 120 : 200;
    host.innerHTML = `
      <div class="direct-launch-settings-stack">
        ${adaptiveAvailable ? `
          <label class="direct-launch-difficulty-row" for="directLaunchDifficulty">
            <span class="direct-launch-field-label">Difficulté de l’activité&nbsp;:</span>
            <select id="directLaunchDifficulty" class="student-select">
              <option value="adaptive"${difficulty === "adaptive" ? " selected" : ""}>Adaptative</option>
              ${LEVELS.map((level) => `<option value="${level}"${difficulty === String(level) ? " selected" : ""}>Niveau ${level}</option>`).join("")}
            </select>
          </label>
        ` : `
          <div class="direct-launch-difficulty-row">
            <span class="direct-launch-field-label">Difficulté de l’activité&nbsp;:</span>
            <div class="direct-launch-static-value">Niveau unique</div>
          </div>
        `}
        ${intrinsic ? `
          <div class="direct-launch-field">
            <span class="direct-launch-field-label">Contenu</span>
            <div class="direct-launch-static-value direct-launch-static-value--icon">
              ${renderMaterialIcon("lock", { className:"dashboard-material-icon" })}
              <span>${isSequence ? "Séquence complète" : "Activité complète"}</span>
            </div>
          </div>
        ` : `
          <div class="direct-launch-passation-grid">
            <label class="direct-launch-field" for="directLaunchExecutionMode">
              <span class="direct-launch-field-label">Format</span>
              <select id="directLaunchExecutionMode" class="student-select">
                <option value="questions"${executionMode === "questions" ? " selected" : ""}>Nombre de questions</option>
                <option value="time"${executionMode === "time" ? " selected" : ""}>Durée</option>
              </select>
            </label>
            ${renderStepperField({
              id:"directLaunchExecutionValue",
              label:executionMode === "time" ? "Durée (min)" : "Quantité",
              value:amount,
              inputMin:1,
              inputMax:amountMax,
              fieldClassName:"direct-launch-amount-stepper"
            })}
          </div>
        `}
      </div>
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
    bindStepperField(host, "directLaunchExecutionValue", {
      inputMin:1,
      inputMax:amountMax,
      onChange:async (raw) => {
        executionValue = executionMode === "time" ? raw * 60 : raw;
        await refreshLink();
      }
    });
  }

  async function refreshLink() {
    const requestId = ++refreshId;
    const result = overlay.querySelector("[data-direct-launch-result]");
    const qrHost = overlay.querySelector("[data-direct-launch-qr]");
    const downloadButton = overlay.querySelector('[data-action="download-qr"]');
    const message = overlay.querySelector("[data-direct-launch-message]");
    if (message) {
      message.textContent = "";
      message.classList.remove("is-error");
    }
    overlay.classList.add("is-loading");
    if (downloadButton) downloadButton.disabled = true;
    if (qrHost) {
      qrHost.setAttribute("aria-label", "QR code en cours de création");
      qrHost.innerHTML = renderLoadingState("Création du QR code…");
    }
    if (result) result.innerHTML = renderLoadingState("Création du lien…");

    try {
      const adaptive = !isSequence && difficulty === "adaptive";
      const savedLink = await saveDirectLaunchLinkForSpace?.(teacherSpaceId, {
        source_type:type,
        source_id:sourceId,
        title_snapshot:title,
        difficulty_mode:adaptive ? "adaptive" : "fixed",
        difficulty_level:adaptive ? null : Math.max(1, Math.min(5, Number(difficulty) || 3)),
        execution_limit_mode:isSequence || intrinsic ? "intrinsic" : executionMode,
        execution_limit_value:isSequence || intrinsic ? null : executionValue
      });
      if (requestId !== refreshId || !overlay.isConnected) return;
      const token = String(savedLink?.token || "").trim();
      if (!token) throw new Error("Lien direct introuvable.");
      const url = buildStudentLaunchUrl(token);
      await renderResult(url, requestId);
    } catch (error) {
      if (requestId !== refreshId || !overlay.isConnected) return;
      if (result) {
        result.innerHTML = `
          <div class="direct-launch-error">
            <span>Le lien n’a pas pu être créé.</span>
            <button class="btn" type="button" data-action="retry">Réessayer</button>
          </div>
        `;
        result.querySelector('[data-action="retry"]')?.addEventListener("click", () => void refreshLink());
      }
      if (qrHost) {
        qrHost.setAttribute("aria-label", "QR code indisponible");
        qrHost.innerHTML = renderQrUnavailable();
      }
      if (message) {
        message.textContent = error?.message || "Impossible de créer le lien direct.";
        message.classList.add("is-error");
      }
    } finally {
      if (requestId === refreshId) overlay.classList.remove("is-loading");
    }
  }

  async function renderResult(url, requestId) {
    const result = overlay.querySelector("[data-direct-launch-result]");
    if (!result) return;
    result.innerHTML = `
      <label class="direct-launch-link-label" for="directLaunchUrl">Lien de l’activité</label>
      <div class="direct-launch-url-row">
        <input id="directLaunchUrl" class="modal-text-input" type="text" readonly value="${escapeAttr(url)}" data-direct-launch-url>
        <button class="btn primary dashboard-btn-with-icon" type="button" data-action="copy-link">
          ${renderMaterialIcon("content_copy", { className:"dashboard-material-icon" })}
          <span data-copy-label>Copier</span>
        </button>
      </div>
    `;
    result.querySelector('[data-action="copy-link"]')?.addEventListener("click", async () => {
      const copyButton = result.querySelector('[data-action="copy-link"]');
      try {
        await navigator.clipboard.writeText(url);
        showCopySuccess(copyButton);
        showToast?.("Lien copié.");
      } catch {
        const input = result.querySelector("[data-direct-launch-url]");
        input?.select?.();
        try {
          document.execCommand("copy");
          showCopySuccess(copyButton);
          showToast?.("Lien copié.");
        } catch {}
      }
    });

    try {
      await ensureQrLibrary();
      if (requestId !== refreshId || !overlay.isConnected) return;
      const persistentQrHost = overlay.querySelector("[data-direct-launch-qr]");
      if (!persistentQrHost || typeof window.QRCode !== "function") return;
      persistentQrHost.innerHTML = "";
      persistentQrHost.setAttribute("aria-label", `QR code pour lancer ${title}`);
      new window.QRCode(persistentQrHost, {
        text:url,
        width:256,
        height:256,
        colorDark:"#111827",
        colorLight:"#ffffff",
        correctLevel:window.QRCode.CorrectLevel?.M
      });
      const downloadButton = overlay.querySelector('[data-action="download-qr"]');
      if (downloadButton) downloadButton.disabled = false;
    } catch {
      if (requestId !== refreshId || !overlay.isConnected) return;
      const qrHost = overlay.querySelector("[data-direct-launch-qr]");
      if (qrHost) {
        qrHost.setAttribute("aria-label", "QR code indisponible");
        qrHost.innerHTML = renderQrUnavailable();
      }
    }
  }
}

function renderLoadingState(label) {
  return `
    <div class="direct-launch-loading" role="status">
      <span class="direct-launch-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderQrUnavailable() {
  return `
    <div class="direct-launch-qr-unavailable">
      ${renderMaterialIcon("info", { className:"dashboard-material-icon" })}
      <strong>QR indisponible</strong>
      <span>Le lien reste utilisable.</span>
    </div>
  `;
}

function showCopySuccess(button) {
  if (!button) return;
  const icon = button.querySelector(".dashboard-material-icon");
  const label = button.querySelector("[data-copy-label]");
  setMaterialIcon(icon, "check_circle");
  if (label) label.textContent = "Copié";
  button.classList.add("is-success");
  window.setTimeout(() => {
    if (!button.isConnected) return;
    setMaterialIcon(icon, "content_copy");
    if (label) label.textContent = "Copier";
    button.classList.remove("is-success");
  }, 1800);
}

function downloadQrCode(qrHost, title, showToast) {
  if (!qrHost) return;
  const canvas = qrHost.querySelector("canvas");
  const image = qrHost.querySelector("img");
  let href = "";
  try {
    href = canvas?.toDataURL?.("image/png") || image?.currentSrc || image?.src || "";
  } catch {}
  if (!href) {
    showToast?.("Le QR code n’est pas encore disponible.", { isError:true });
    return;
  }
  const link = document.createElement("a");
  link.href = href;
  link.download = `${toFilename(title)}-qr.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast?.("QR code téléchargé.");
}

function toFilename(value) {
  const filename = String(value || "activite")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return filename || "activite";
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
    script.onerror = () => {
      script.remove();
      reject(new Error("Bibliothèque QR indisponible."));
    };
    document.head.appendChild(script);
  });
  qrScriptPromise.catch(() => {
    qrScriptPromise = null;
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
