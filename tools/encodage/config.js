import {
  renderInlineRadioControl,
  renderStepperField,
  bindRadio,
  bindStepperField,
  readRadio,
  readStepper,
  refreshStepper
} from "../../shared/config-widgets.js";
import {
  INPUT_MODES,
  LENGTH_HINT_MODES,
  INDIVIDUAL_VALIDATION_MODES,
  DEFAULT_INDIVIDUAL_MAX_ATTEMPTS,
  getAvailableGraphs,
  getDefaultSettings,
  normalizeSettings,
  getGraphImageUrl,
  getGraphFallbackDisplay,
  getGraphLabel,
  setWordCatalog,
  getWordPool,
  getSelectedGraphUsageStats,
  visibleTextOfGraph
} from "./model.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  listTeacherPhonologyPresets,
  upsertTeacherPhonologyPreset,
  deleteTeacherPhonologyPreset
} from "./presets-api.js";

let stylesInjected = false;
let editorState = createInitialPresetState();

const TOOL_KEY = "encodage";
const PRESET_SELECT_ID = "phono_user_preset";
const CLICK_SUPPRESSION_MS = 220;
const DOUBLE_ACTIVATE_MS = 320;
const INDIVIDUAL_ATTEMPTS_MIN = 1;
const INDIVIDUAL_ATTEMPTS_MAX = 12;
let publicPhonologyWordsPromise = null;

export { getDefaultSettings };

function getPresetErrorMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  return message || fallback;
}

function getResponseUiFromContext(context = {}) {
  const safeValue = String(
    context?.responseUi
    ?? context?.response_ui
    ?? context?.passationProfile?.responseUi
    ?? context?.passationProfile?.response_ui
    ?? ""
  ).trim().toLowerCase();

  return safeValue === "free" ? "free" : "boxed";
}

function shouldShowValidationSettings(context = {}) {
  return getResponseUiFromContext(context) === "boxed";
}

export function renderToolSettings(container, settings, context = {}) {
  injectStyles();

  const cfg = normalizeSettings(settings);
  const showValidation = shouldShowValidationSettings(context);
  const teacherSpaceId = Number(context?.teacherSpace?.id || 0) || null;

  if (editorState.teacherSpaceId !== teacherSpaceId) {
    editorState = createInitialPresetState(teacherSpaceId);
  }

  closePresetModal();

  container.innerHTML = `
    <div
      class="phono-config-root"
      data-phono-input-mode="${escapeAttr(cfg.inputMode)}"
      data-phono-length-hint-mode="${escapeAttr(cfg.lengthHintMode)}"
      data-phono-validation-mode="${escapeAttr(cfg.individualValidationMode)}"
      data-phono-validation-attempts="${escapeAttr(cfg.individualMaxAttempts)}"
      data-graph-order-store="${escapeAttr(cfg.graphOrder.join("¦"))}"
    >
      <div class="phono-config-stack">
        <section class="tv-group tv-group-inline phono-mode-group">
          ${renderInlineRadioControl({
          title: "Saisie attendue",
          id: "phono_input_mode",
          value: cfg.inputMode,
          options: [
            { value: INPUT_MODES.GRAPHEMES, label: "Graphèmes" },
            { value: INPUT_MODES.LETTERS, label: "Lettres" }
          ],
          rootClassName: "phono-mode-radio-control"
        })}
        </section>

        <section class="tv-group tv-group-inline phono-mode-group">
          ${renderInlineRadioControl({
          title: "Indice de longueur",
          id: "phono_length_hint_mode",
          value: cfg.lengthHintMode,
          options: [
            { value: LENGTH_HINT_MODES.NONE, label: "Aucun indice" },
            { value: LENGTH_HINT_MODES.BOXES, label: "Cases visibles" }
          ],
          rootClassName: "phono-mode-radio-control"
        })}
        </section>

        ${showValidation ? renderValidationSettings(cfg) : ""}
        ${renderLibrarySettings(cfg)}
      </div>
    </div>
  `;

  bindRadio(container, "phono_input_mode", {
    onChange: () => {
      renderToolSettings(container, readCurrentSettings(container), context);
    }
  });
  bindRadio(container, "phono_length_hint_mode");

  if (showValidation) {
    bindRadio(container, "phono_individual_validation", {
      onChange: () => syncValidationModeUi(container)
    });
    bindValidationModeEvents(container);
    syncValidationModeUi(container);
  }

  bindPresetSelect(container);
  bindEvents(container, context);
  bindGraphAssetFallbacks(container);
  ensurePublicWordCatalogLoaded(container).catch(() => {});
  ensurePresetsLoaded(container, context).catch((err) => {
    editorState.status = "error";
    updatePresetShell(container, { selectedId: readCurrentPresetId(container) || "" });
  });
}

function renderValidationSettings(cfg) {
  return `
    <section class="tv-group tv-group-inline phono-validation-group" data-phono-validation-group>
      <div class="phono-validation-line">
        <div class="tv-group-title phono-validation-title">Validation</div>
        ${renderInlineRadioControl({
          id: "phono_individual_validation",
          value: cfg.individualValidationMode,
          options: [
            { value: INDIVIDUAL_VALIDATION_MODES.UNLIMITED, label: "Essais illimités" },
            { value: INDIVIDUAL_VALIDATION_MODES.GRAPHO_TOLERANCE, label: "Tolérance graphophonique" },
            { value: INDIVIDUAL_VALIDATION_MODES.LIMITED_ATTEMPTS, label: "Essais limités" }
          ],
          rootClassName: "phono-validation-radio-control"
        })}
        ${renderStepperField({
          id: "phono_individual_max_attempts",
          label: "Nombre d’essais",
          value: cfg.individualMaxAttempts || DEFAULT_INDIVIDUAL_MAX_ATTEMPTS,
          inputMin: INDIVIDUAL_ATTEMPTS_MIN,
          inputMax: INDIVIDUAL_ATTEMPTS_MAX,
          step: 1,
          fieldClassName: "phono-attempts-field"
        })}
      </div>
    </section>
  `;
}

function renderLibrarySettings(cfg) {
  if (cfg.inputMode === INPUT_MODES.LETTERS) {
    return `
      <section class="tv-group">
        <div class="phono-library-head">
          <div class="tv-group-title">Bibliothèque de graphèmes</div>
        </div>
        <div class="phono-library-disabled">
          En mode lettres, la bibliothèque de graphèmes n’est pas utilisée.
        </div>
      </section>
    `;
  }

  return `
    <section class="tv-group">
      <div class="phono-library-head">
        <div class="tv-group-title">Bibliothèque de graphèmes</div>
        <div class="phono-library-head-right">
          <div class="phono-library-summary${getWordPool(cfg).length === 0 ? " is-warning" : ""}" data-selection-summary>
            ${renderSelectionSummary(cfg)}
          </div>
          <div data-graph-usage-help>
            ${renderGraphUsageHelp(cfg)}
          </div>
        </div>
      </div>

      <div data-preset-shell>
        ${renderPresetShell({
          selectedId: findMatchingPresetId(cfg.graphOrder),
          previewGraph: editorState.previewGraph
        })}
      </div>

      <div
        class="phono-graph-board"
        data-graph-board
        data-graph-order="${escapeAttr(cfg.graphOrder.join("¦"))}"
      >
        ${renderGraphBoard(cfg.graphOrder)}
      </div>
    </section>
  `;
}

export function readToolSettings(container) {
  return normalizeSettings({
    inputMode: readRadio(container, "phono_input_mode", readStoredInputMode(container)),
    lengthHintMode: readRadio(container, "phono_length_hint_mode", readStoredLengthHintMode(container)),
    individualValidationMode: readRadio(container, "phono_individual_validation", readStoredValidationMode(container)),
    individualMaxAttempts: readIndividualMaxAttempts(container),
    graphOrder: readGraphOrder(container, [])
  });
}

function createInitialPresetState(teacherSpaceId = null) {
  return {
    teacherSpaceId,
    status: teacherSpaceId ? "idle" : "unavailable",
    presets: [],
    previewGraph: "",
    activeRequestId: 0
  };
}

async function ensurePublicWordCatalogLoaded(container) {
  if (!publicPhonologyWordsPromise) {
    publicPhonologyWordsPromise = listPublicPhonologyWords()
      .then((rows) => {
        const words = Array.isArray(rows) ? rows : [];
        setWordCatalog(words);
        return words;
      })
      .catch((error) => {
        publicPhonologyWordsPromise = null;
        throw error;
      });
  }

  await publicPhonologyWordsPromise;

  const cfg = readCurrentSettings(container);
  refreshSelectionStats(container, cfg);
}

function bindEvents(container, context) {
  const board = container.querySelector("[data-graph-board]");

  board?.addEventListener("pointerup", (event) => {
    if (isClickSuppressed(container)) return;

    const tile = event.target.closest("[data-graph-tile]");
    if (!tile) return;

    const graph = String(tile.dataset.graphTile || "").trim();
    if (!graph) return;

    const now = Date.now();
    const lastGraph = String(container.dataset.phonoLastActivateGraph || "");
    const lastAt = Number(container.dataset.phonoLastActivateAt || 0);
    const isDouble = lastGraph === graph && Number.isFinite(lastAt) && now - lastAt <= DOUBLE_ACTIVATE_MS;

    if (isDouble) {
      toggleGraphSelection(container, graph);
      container.dataset.phonoLastActivateGraph = "";
      container.dataset.phonoLastActivateAt = "0";
      suppressNextClick(container);
      return;
    }

    setPreviewGraph(container, graph);
    container.dataset.phonoLastActivateGraph = graph;
    container.dataset.phonoLastActivateAt = String(now);
  });

  board?.addEventListener("keydown", (event) => {
    const tile = event.target.closest("[data-graph-tile]");
    if (!tile) return;

    const graph = String(tile.dataset.graphTile || "").trim();
    if (!graph) return;

    if (event.key === "Enter") {
      event.preventDefault();
      setPreviewGraph(container, graph);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      toggleGraphSelection(container, graph);
    }
  });

  board?.addEventListener("focusin", (event) => {
    const tile = event.target.closest("[data-graph-tile]");
    if (!tile) return;
    setPreviewGraph(container, String(tile.dataset.graphTile || ""));
  });

  board?.addEventListener("dragstart", (event) => {
    const button = event.target.closest("[data-graph-tile]");
    if (!button || button.dataset.selected !== "true") {
      event.preventDefault();
      return;
    }

    const graph = String(button.dataset.graphTile || "").trim();
    if (!graph) {
      event.preventDefault();
      return;
    }

    board.dataset.dragGraph = graph;
    button.classList.add("is-dragging");
    event.dataTransfer?.setData("text/plain", graph);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      const previewImg = button.querySelector("img");
      const ghost = createDragGhost(button, previewImg);
      if (ghost) {
        event.dataTransfer.setDragImage(ghost, ghost.width / 2, ghost.height / 2);
      }
    }
  });

  board?.addEventListener("dragover", (event) => {
    const dragGraph = String(board.dataset.dragGraph || "").trim();
    if (!dragGraph) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    updateDropTarget(board, event.clientX, event.clientY);
  });

  board?.addEventListener("dragleave", (event) => {
    if (!board.contains(event.relatedTarget)) {
      clearDropTargets(board);
    }
  });

  board?.addEventListener("drop", (event) => {
    const dragGraph = String(board.dataset.dragGraph || event.dataTransfer?.getData("text/plain") || "").trim();
    if (!dragGraph) return;

    event.preventDefault();

    const current = readGraphOrder(container, []);
    const withoutDragged = current.filter((graph) => graph !== dragGraph);
    let dropIndex = Number(board.dataset.dropIndex || withoutDragged.length);
    if (!Number.isFinite(dropIndex)) {
      dropIndex = withoutDragged.length;
    }
    dropIndex = Math.max(0, Math.min(withoutDragged.length, dropIndex));

    const next = [...withoutDragged];
    next.splice(dropIndex, 0, dragGraph);

    clearDropTargets(board);
    setGraphOrder(container, next);
    suppressNextClick(container);
  });

  board?.addEventListener("dragend", () => {
    board.removeAttribute("data-drag-graph");
    clearDropTargets(board);
    board.querySelectorAll(".is-dragging").forEach((node) => node.classList.remove("is-dragging"));
    suppressNextClick(container);
  });

  if (container.__phonoConfigClickHandler) {
    container.removeEventListener("click", container.__phonoConfigClickHandler);
  }

  container.__phonoConfigClickHandler = (event) => {
    const saveBtn = event.target.closest("[data-preset-save='1']");
    if (saveBtn) {
      openPresetModal(container, context);
      return;
    }

    const deleteBtn = event.target.closest("[data-preset-delete='1']");
    if (deleteBtn) {
      void confirmPresetDelete(container, context);
      return;
    }

  };

  container.addEventListener("click", container.__phonoConfigClickHandler);

}

function toggleGraphSelection(container, graph) {
  const current = readGraphOrder(container, []);
  const next = current.includes(graph)
    ? current.filter((item) => item !== graph)
    : [...current, graph];

  setGraphOrder(container, next);
}

function setGraphOrder(container, graphOrder) {
  const cfg = normalizeSettings({
    inputMode: readRadio(container, "phono_input_mode", readStoredInputMode(container)),
    lengthHintMode: readRadio(container, "phono_length_hint_mode", readStoredLengthHintMode(container)),
    individualValidationMode: readRadio(container, "phono_individual_validation", readStoredValidationMode(container)),
    individualMaxAttempts: readIndividualMaxAttempts(container),
    graphOrder
  });

  storeCurrentSettings(container, cfg);
  updateGraphBoard(container, cfg.graphOrder);
  refreshSelectionStats(container, cfg);
  syncPresetSelectionWithGraphOrder(container, cfg.graphOrder);
}

function readCurrentSettings(container) {
  return normalizeSettings({
    inputMode: readRadio(container, "phono_input_mode", readStoredInputMode(container)),
    lengthHintMode: readRadio(container, "phono_length_hint_mode", readStoredLengthHintMode(container)),
    individualValidationMode: readRadio(container, "phono_individual_validation", readStoredValidationMode(container)),
    individualMaxAttempts: readIndividualMaxAttempts(container),
    graphOrder: readGraphOrder(container, [])
  });
}

function getConfigRoot(container) {
  return container.querySelector(".phono-config-root");
}

function storeCurrentSettings(container, cfg) {
  const root = getConfigRoot(container);
  if (!root) return;
  root.dataset.phonoInputMode = cfg.inputMode;
  root.dataset.phonoLengthHintMode = cfg.lengthHintMode;
  root.dataset.phonoValidationMode = cfg.individualValidationMode;
  root.dataset.phonoValidationAttempts = String(cfg.individualMaxAttempts || DEFAULT_INDIVIDUAL_MAX_ATTEMPTS);
  root.dataset.graphOrderStore = cfg.graphOrder.join("¦");
}

function readStoredInputMode(container) {
  return String(getConfigRoot(container)?.dataset.phonoInputMode || INPUT_MODES.GRAPHEMES);
}

function readStoredLengthHintMode(container) {
  return String(getConfigRoot(container)?.dataset.phonoLengthHintMode || LENGTH_HINT_MODES.NONE);
}

function readStoredValidationMode(container) {
  return String(getConfigRoot(container)?.dataset.phonoValidationMode || INDIVIDUAL_VALIDATION_MODES.UNLIMITED);
}

function readStoredValidationAttempts(container) {
  return Number(getConfigRoot(container)?.dataset.phonoValidationAttempts || DEFAULT_INDIVIDUAL_MAX_ATTEMPTS);
}

function bindValidationModeEvents(container) {
  bindStepperField(container, "phono_individual_max_attempts", {
    inputMin: INDIVIDUAL_ATTEMPTS_MIN,
    inputMax: INDIVIDUAL_ATTEMPTS_MAX,
    onChange: () => {
      syncValidationModeUi(container);
    }
  });
}

function syncValidationModeUi(container) {
  const mode = readRadio(container, "phono_individual_validation", INDIVIDUAL_VALIDATION_MODES.UNLIMITED);
  const field = container.querySelector(".phono-attempts-field");
  const input = container.querySelector("#phono_individual_max_attempts");
  const isLimited = mode === INDIVIDUAL_VALIDATION_MODES.LIMITED_ATTEMPTS;

  field?.classList.toggle("is-disabled", !isLimited);
  if (input) {
    input.disabled = !isLimited;
    input.tabIndex = isLimited ? 0 : -1;
    refreshStepper(container, "phono_individual_max_attempts", {
      inputMin: INDIVIDUAL_ATTEMPTS_MIN,
      inputMax: INDIVIDUAL_ATTEMPTS_MAX
    });
  }
}

function readIndividualMaxAttempts(container) {
  const input = container.querySelector("#phono_individual_max_attempts");
  if (!input) {
    return readStoredValidationAttempts(container);
  }

  return readStepper(container, "phono_individual_max_attempts", {
    inputMin: INDIVIDUAL_ATTEMPTS_MIN,
    inputMax: INDIVIDUAL_ATTEMPTS_MAX
  });
}

function readGraphOrder(container, fallback = []) {
  const host = container.querySelector("[data-graph-board]");
  if (!host) {
    const stored = String(getConfigRoot(container)?.dataset.graphOrderStore || "");
    if (stored) {
      return stored
        .split("¦")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return Array.isArray(fallback) ? [...fallback] : [];
  }

  const raw = host.dataset.graphOrder || "";
  if (!raw) return [];

  return raw
    .split("¦")
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateGraphBoard(container, graphOrder) {
  const host = container.querySelector("[data-graph-board]");
  if (!host) return;

  host.dataset.graphOrder = graphOrder.join("¦");
  host.innerHTML = renderGraphBoard(graphOrder);
  const root = getConfigRoot(container);
  if (root) {
    root.dataset.graphOrderStore = graphOrder.join("¦");
  }
  bindGraphAssetFallbacks(host);
}

function updateSelectionSummary(container, cfg) {
  const host = container.querySelector("[data-selection-summary]");
  if (!host) return;

  const wordCount = getWordPool(cfg).length;
  host.classList.toggle("is-warning", wordCount === 0);
  host.textContent = renderSelectionSummary(cfg);
}

function updateGraphUsageHelp(container, cfg) {
  const host = container.querySelector("[data-graph-usage-help]");
  if (!host) return;

  host.innerHTML = renderGraphUsageHelp(cfg);
}

function refreshSelectionStats(container, cfg) {
  updateSelectionSummary(container, cfg);
  updateGraphUsageHelp(container, cfg);
}

function renderSelectionSummary(cfg) {
  const wordCount = getWordPool(cfg).length;
  const graphCount = cfg.graphOrder.length;
  return `(${graphCount} graphème${graphCount > 1 ? "s" : ""} → ${wordCount} mot${wordCount > 1 ? "s" : ""} jouable${wordCount > 1 ? "s" : ""})`;
}

function renderGraphUsageHelp(cfg) {
  const stats = getSelectedGraphUsageStats(cfg);
  const totalOccurrences = stats.items.reduce((sum, item) => sum + item.occurrences, 0);

  return `
    <div class="phono-usage-help">
      <button
        class="phono-usage-help-trigger"
        type="button"
        aria-label="Afficher la répartition des graphèmes dans les mots jouables"
        title="Répartition des graphèmes"
      >?</button>
      <div class="phono-usage-help-popup" role="tooltip">
        <div class="phono-usage-help-title">Répartition des graphèmes</div>
        <div class="phono-usage-help-meta">
          ${stats.wordCount} mot${stats.wordCount > 1 ? "s" : ""} jouable${stats.wordCount > 1 ? "s" : ""} · ${totalOccurrences} occurrence${totalOccurrences > 1 ? "s" : ""}
        </div>
        ${renderGraphUsageRows(stats)}
      </div>
    </div>
  `;
}

function renderGraphUsageRows(stats) {
  if (!Array.isArray(stats?.items) || stats.items.length === 0) {
    return `<div class="phono-usage-help-empty">Aucun graphème activé.</div>`;
  }

  return `
    <div class="phono-usage-help-grid">
      ${stats.items.map((item) => `
        <div class="phono-usage-pill" title="${escapeAttr(item.label)}">
          <span class="phono-usage-pill-graph">${escapeHtml(visibleTextOfGraph(item.graph))}</span>
          <span class="phono-usage-pill-times">×${item.occurrences}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderGraphVisual(graph, {
  activeIds = [],
  rootClassName = "phono-graph-visual",
  imgClassName = "phono-graph-img",
  fallbackClassName = "phono-graph-fallback"
} = {}) {
  const imageUrl = getGraphImageUrl(graph);
  const fallback = getGraphFallbackDisplay(graph, activeIds);
  const subLabel = fallback.subLabel
    ? `<span class="${escapeAttr(fallbackClassName)}-sub">${escapeHtml(fallback.subLabel)}</span>`
    : "";

  return `
    <span class="${escapeAttr(rootClassName)}" data-graph-visual>
      ${imageUrl ? `<img class="${escapeAttr(imgClassName)}" src="${escapeAttr(imageUrl)}" alt="" draggable="false" data-graph-img>` : ""}
      <span class="${escapeAttr(fallbackClassName)}" data-graph-fallback data-unit-size="${escapeAttr(getUnitSizeBucket(fallback.label))}">
        <span>${escapeHtml(fallback.label)}</span>
        ${subLabel}
      </span>
    </span>
  `;
}

function getUnitSizeBucket(text) {
  const length = Array.from(String(text || "")).length;
  if (length >= 5) return "long";
  if (length >= 3) return "medium";
  return "short";
}

function bindGraphAssetFallbacks(root) {
  root.querySelectorAll("[data-graph-visual]").forEach((visual) => {
    const img = visual.querySelector("[data-graph-img]");
    if (!(img instanceof HTMLImageElement)) {
      visual.classList.add("is-fallback");
      return;
    }

    img.addEventListener("error", () => {
      img.hidden = true;
      visual.classList.add("is-fallback");
    }, { once: true });

    if (!img.getAttribute("src")) {
      img.hidden = true;
      visual.classList.add("is-fallback");
    } else if (img.complete && img.naturalWidth === 0) {
      img.hidden = true;
      visual.classList.add("is-fallback");
    }
  });
}

function renderGraphBoard(graphOrder) {
  const selected = Array.isArray(graphOrder) ? graphOrder : [];
  const selectedSet = new Set(selected);
  const displayOrder = [
    ...selected,
    ...getAvailableGraphs().filter((graph) => !selectedSet.has(graph))
  ];

  const tilesHtml = displayOrder.map((graph) => renderGraphTile(graph, {
    selected: selectedSet.has(graph)
  })).join("");

  return `${tilesHtml}<div class="phono-drop-indicator" data-drop-indicator hidden></div>`;
}

function renderGraphTile(graph, { selected }) {
  const title = getGraphLabel(graph);
  const activeIds = getAvailableGraphs();

  return `
    <button
      class="phono-graph-tile${selected ? " is-selected" : ""}"
      type="button"
      data-graph-tile="${escapeAttr(graph)}"
      data-selected="${selected ? "true" : "false"}"
      aria-pressed="${selected ? "true" : "false"}"
      aria-label="${escapeAttr(title)}"
      title="${escapeAttr(title)}"
      draggable="${selected ? "true" : "false"}"
    >
      ${renderGraphVisual(graph, {
        activeIds,
        imgClassName: "phono-graph-img",
        fallbackClassName: "phono-graph-fallback"
      })}
    </button>
  `;
}

function renderPresetShell({ selectedId = "", previewGraph = "" } = {}) {
  const saveDisabled = editorState.status === "loading" || editorState.status === "saving" || editorState.status === "unavailable";
  const deleteDisabled = !selectedId || editorState.status === "loading" || editorState.status === "saving";

  return `
    <div class="phono-library-meta-grid">
      <div class="phono-library-help" data-phono-help>
        <div>· simple clic → Aperçu d’un graphème</div>
        <div>· double clic → Ajout du graphème à la sélection</div>
        <div>· Ordre des graphèmes modifiable par glisser-déposer</div>
      </div>

      <div class="phono-preset-main">
        <div class="phono-preset-inline-row">
          <div class="tv-group-title phono-preset-label">Presets</div>
          ${renderPresetSelect({ selectedId })}
          <div class="phono-preset-actions">
            <button
              class="phono-icon-btn"
              type="button"
              data-preset-save="1"
              aria-label="Enregistrer le preset actuel"
              title="Enregistrer le preset actuel"
              ${saveDisabled ? "disabled" : ""}
            >
              <span class="phono-material-icon" aria-hidden="true">save</span>
            </button>
            <button
              class="phono-icon-btn"
              type="button"
              data-preset-delete="1"
              aria-label="Supprimer le preset sélectionné"
              title="Supprimer le preset sélectionné"
              ${deleteDisabled ? "disabled" : ""}
            >
              <span class="phono-material-icon" aria-hidden="true">delete</span>
            </button>
          </div>
        </div>

      </div>

      <div class="phono-hover-preview-wrap">
        <div class="tv-group-title phono-preview-title">Aperçu graphème</div>
        <div class="phono-hover-preview" data-hover-preview>
          ${renderHoverPreview(previewGraph)}
        </div>
      </div>
    </div>
  `;
}

function renderPresetSelect({ selectedId = "" } = {}) {
  const disabled = editorState.status === "loading"
    || editorState.status === "saving"
    || editorState.status === "unavailable"
    || editorState.presets.length === 0;

  const selected = editorState.presets.find((preset) => preset.id === String(selectedId || "")) || null;
  const isDirty = !selected && editorState.presets.length > 0;
  const label = selected?.name || (isDirty ? "Preset modifié !" : "Presets");
  const optionsHtml = editorState.presets.map((preset) => `
    <button
      class="tv-custom-select-option ${preset.id === selected?.id ? "is-selected" : ""}"
      type="button"
      role="option"
      data-value="${escapeAttr(preset.id)}"
      data-label="${escapeAttr(preset.name)}"
      aria-selected="${preset.id === selected?.id ? "true" : "false"}"
    >
      ${escapeHtml(preset.name)}
    </button>
  `).join("");

  return `
    <div class="tv-custom-select phono-preset-select-control" data-preset-select-root="${escapeAttr(PRESET_SELECT_ID)}">
      <input type="hidden" id="${PRESET_SELECT_ID}" value="${escapeAttr(selected?.id || "")}">
      <button
        class="tv-input tv-custom-select-trigger ${isDirty ? "is-dirty" : ""}"
        type="button"
        id="${PRESET_SELECT_ID}_trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
        ${disabled ? "disabled" : ""}
      >
        <span class="tv-custom-select-text">${escapeHtml(label)}</span>
        <span class="tv-stepper-icon tv-custom-select-chevron" aria-hidden="true">expand_more</span>
      </button>
      <div class="tv-custom-select-menu" role="listbox" aria-labelledby="${PRESET_SELECT_ID}_trigger">
        ${optionsHtml}
      </div>
    </div>
  `;
}

function renderHoverPreview(graph) {
  const safeGraph = String(graph || "").trim();
  if (!safeGraph) {
    return `<div class="phono-hover-preview-empty" aria-hidden="true"></div>`;
  }

  return `
    ${renderGraphVisual(safeGraph, {
      activeIds: getAvailableGraphs(),
      rootClassName: "phono-hover-preview-visual",
      imgClassName: "phono-hover-preview-img",
      fallbackClassName: "phono-hover-preview-fallback"
    })}
  `;
}

function updatePresetShell(container, { selectedId = null } = {}) {
  const host = container.querySelector("[data-preset-shell]");
  if (!host) return;

  const nextSelectedId = selectedId == null
    ? readCurrentPresetId(container)
    : String(selectedId || "");

  host.innerHTML = renderPresetShell({
    selectedId: nextSelectedId,
    previewGraph: editorState.previewGraph
  });

  bindPresetSelect(container);
  bindGraphAssetFallbacks(host);
}

function bindPresetSelect(container) {
  const root = container.querySelector("[data-preset-select-root]");
  const input = container.querySelector(`#${PRESET_SELECT_ID}`);
  if (!root || !input) return;

  const trigger = root.querySelector(`#${PRESET_SELECT_ID}_trigger`);
  const textEl = root.querySelector(".tv-custom-select-text");
  const menu = root.querySelector(".tv-custom-select-menu");
  const options = Array.from(root.querySelectorAll(".tv-custom-select-option"));
  if (!trigger || !textEl || !menu) return;

  const optionMap = new Map(options.map((btn) => [String(btn.dataset.value ?? ""), btn]));

  const closeMenu = ({ restoreFocus = false } = {}) => {
    root.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus();
  };

  const updateDisplay = (nextValue) => {
    const safeValue = optionMap.has(String(nextValue)) ? String(nextValue) : "";
    input.value = safeValue;
    const selected = editorState.presets.find((preset) => preset.id === safeValue) || null;
    const isDirty = !selected && editorState.presets.length > 0;
    textEl.textContent = selected?.name || (isDirty ? "Preset modifié !" : "Presets");
    trigger.classList.toggle("is-dirty", isDirty);

    options.forEach((btn) => {
      const isActive = String(btn.dataset.value ?? "") === safeValue;
      btn.classList.toggle("is-selected", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  };

  const openMenu = () => {
    if (trigger.disabled || options.length === 0) return;
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    const current = optionMap.get(String(input.value ?? "")) || options[0];
    current?.focus();
  };

  const applyValue = (nextValue, { emit = false } = {}) => {
    updateDisplay(nextValue);
    if (!emit) return;

    const preset = editorState.presets.find((item) => item.id === input.value) || null;
    if (preset) {
      setGraphOrder(container, preset.graphOrder);
      setCurrentPresetId(container, preset.id);
    }
  };

  trigger.addEventListener("click", () => {
    if (root.classList.contains("is-open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  });

  options.forEach((btn, index) => {
    btn.addEventListener("click", () => {
      applyValue(btn.dataset.value ?? "", { emit: true });
      closeMenu({ restoreFocus: true });
    });

    btn.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        options[Math.min(index + 1, options.length - 1)]?.focus();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        options[Math.max(index - 1, 0)]?.focus();
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        options[0]?.focus();
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        options[options.length - 1]?.focus();
      }
    });
  });

  const onDocumentPointerDown = (event) => {
    if (!root.isConnected) {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      return;
    }

    if (!root.contains(event.target)) {
      closeMenu();
    }
  };

  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  updateDisplay(input.value);
}

function readCurrentPresetId(container) {
  return String(container.querySelector(`#${PRESET_SELECT_ID}`)?.value || "").trim();
}

function setCurrentPresetId(container, presetId) {
  updatePresetShell(container, { selectedId: String(presetId || "") });
}

function syncPresetSelectionWithGraphOrder(container, graphOrder) {
  const matchedId = findMatchingPresetId(graphOrder);
  setCurrentPresetId(container, matchedId);
}

function findMatchingPresetId(graphOrder) {
  const normalizedOrder = normalizeSettings({ graphOrder }).graphOrder;
  const match = editorState.presets.find((preset) => arraysEqual(preset.graphOrder, normalizedOrder));
  return match?.id || "";
}

async function ensurePresetsLoaded(container, context) {
  const teacherSpaceId = Number(context?.teacherSpace?.id || 0) || null;
  if (!teacherSpaceId) return;
  if (editorState.status === "loading") return;
  if (editorState.status === "ready" && editorState.teacherSpaceId === teacherSpaceId) {
    updatePresetShell(container, { selectedId: findMatchingPresetId(readGraphOrder(container, [])) });
    return;
  }

  editorState.status = "loading";
  updatePresetShell(container, { selectedId: "" });

  const requestId = ++editorState.activeRequestId;
  const rows = await listTeacherPhonologyPresets(teacherSpaceId, { toolKey: TOOL_KEY });
  if (requestId !== editorState.activeRequestId) return;

  editorState.presets = rows
    .map((row) => normalizePresetRecord(row))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  editorState.status = "ready";
  updatePresetShell(container, { selectedId: findMatchingPresetId(readGraphOrder(container, [])) });
}

function openPresetModal(container, context) {
  const teacherSpaceId = Number(context?.teacherSpace?.id || 0) || null;
  if (!teacherSpaceId) {
    updatePresetShell(container, { selectedId: readCurrentPresetId(container) || "" });
    return;
  }

  closePresetModal();

  const currentPresetId = readCurrentPresetId(container);
  const currentPreset = editorState.presets.find((item) => item.id === currentPresetId) || null;
  const overlay = document.createElement("div");
  overlay.className = "modal phono-preset-dialog";
  overlay.dataset.phonoPresetDialog = "save";
  overlay.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="phonoPresetSaveTitle">
      <div class="modal-title" id="phonoPresetSaveTitle">Enregistrer un preset</div>
      <div class="phono-modal-text">Choisis un nom pour réutiliser cette sélection de graphèmes plus tard.</div>
      <input class="modal-text-input" type="text" maxlength="80" placeholder="Ex. : sons vus en période 2" data-phono-preset-name>
      <div class="modal-actions">
        <div class="modal-message" data-phono-modal-message></div>
        <button class="btn" type="button" data-phono-modal-cancel>Annuler</button>
        <button class="btn primary" type="button" data-phono-modal-confirm>Enregistrer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector("[data-phono-preset-name]");
  const message = overlay.querySelector("[data-phono-modal-message]");
  const close = () => overlay.remove();

  if (input) {
    input.value = currentPreset?.name || "";
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void confirmPresetSave(container, context, { overlay, input, message, close });
    }
  });

  overlay.querySelector("[data-phono-modal-cancel]")?.addEventListener("click", close);
  overlay.querySelector("[data-phono-modal-confirm]")?.addEventListener("click", () => {
    void confirmPresetSave(container, context, { overlay, input, message, close });
  });

  requestAnimationFrame(() => {
    input?.focus();
    input?.select();
  });
}

function closePresetModal() {
  document.querySelectorAll(".phono-preset-dialog").forEach((node) => node.remove());
}

async function confirmPresetSave(container, context, refs = {}) {
  const input = refs.input instanceof HTMLInputElement ? refs.input : null;
  const message = refs.message instanceof HTMLElement ? refs.message : null;
  if (!input || !message) return;

  const teacherSpaceId = Number(context?.teacherSpace?.id || 0) || null;
  if (!teacherSpaceId) {
    message.textContent = "Espace enseignant introuvable.";
    message.classList.add("is-error");
    return;
  }

  const name = String(input.value || "").trim();
  if (!name) {
    message.textContent = "Entre un nom de preset.";
    message.classList.add("is-error");
    input.focus();
    return;
  }

  const currentPresetId = readCurrentPresetId(container);
  const matchingById = editorState.presets.find((item) => item.id === currentPresetId) || null;
  const matchingByName = editorState.presets.find((item) => item.name.localeCompare(name, "fr", { sensitivity: "base" }) === 0) || null;
  const target = matchingById || matchingByName;

  editorState.status = "saving";
  updatePresetShell(container, { selectedId: currentPresetId || "" });

  try {
    const rows = await upsertTeacherPhonologyPreset(teacherSpaceId, {
      id: target?.id || createPresetId(),
      name,
      graphOrder: readGraphOrder(container, [])
    }, {
      toolKey: TOOL_KEY
    });

    editorState.presets = rows
      .map((row) => normalizePresetRecord(row))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    editorState.status = "ready";
    refs.close?.();
    updatePresetShell(container, { selectedId: target?.id || findMatchingPresetId(readGraphOrder(container, [])) });
  } catch (err) {
    editorState.status = "error";
    message.textContent = getPresetErrorMessage(err, "Impossible d’enregistrer ce preset.");
    message.classList.add("is-error");
    updatePresetShell(container, { selectedId: currentPresetId || "" });
  }
}

async function confirmPresetDelete(container, context) {
  const teacherSpaceId = Number(context?.teacherSpace?.id || 0) || null;
  if (!teacherSpaceId) {
    updatePresetShell(container, { selectedId: readCurrentPresetId(container) || "" });
    return;
  }

  const presetId = readCurrentPresetId(container);
  if (!presetId) return;

  const preset = editorState.presets.find((item) => item.id === presetId) || null;
  if (!preset) return;

  closePresetModal();

  const overlay = document.createElement("div");
  overlay.className = "modal phono-preset-dialog";
  overlay.dataset.phonoPresetDialog = "delete";
  overlay.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="phonoPresetDeleteTitle">
      <div class="modal-title" id="phonoPresetDeleteTitle">Supprimer un preset</div>
      <div class="phono-modal-text phono-modal-text--danger">Supprimer le preset « ${escapeHtml(preset.name)} » ?</div>
      <div class="modal-actions">
        <div class="modal-message" data-phono-modal-message></div>
        <button class="btn" type="button" data-phono-modal-cancel>Annuler</button>
        <button class="btn primary" type="button" data-phono-modal-confirm>Supprimer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const message = overlay.querySelector("[data-phono-modal-message]");
  const close = () => overlay.remove();

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void executePresetDelete(container, context, { teacherSpaceId, preset, presetId, message, close });
    }
  });

  overlay.querySelector("[data-phono-modal-cancel]")?.addEventListener("click", close);
  overlay.querySelector("[data-phono-modal-confirm]")?.addEventListener("click", () => {
    void executePresetDelete(container, context, { teacherSpaceId, preset, presetId, message, close });
  });

  requestAnimationFrame(() => {
    overlay.querySelector("[data-phono-modal-confirm]")?.focus();
  });
}

async function executePresetDelete(container, context, { teacherSpaceId, preset, presetId, message, close } = {}) {
  if (!teacherSpaceId || !presetId || !preset) return;

  editorState.status = "saving";
  updatePresetShell(container, { selectedId: presetId });

  try {
    const rows = await deleteTeacherPhonologyPreset(teacherSpaceId, presetId, { toolKey: TOOL_KEY });
    editorState.presets = rows
      .map((row) => normalizePresetRecord(row))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    editorState.status = "ready";
    close?.();
    updatePresetShell(container, { selectedId: findMatchingPresetId(readGraphOrder(container, [])) });
  } catch (err) {
    editorState.status = "error";
    if (message instanceof HTMLElement) {
      message.textContent = getPresetErrorMessage(err, "Impossible de supprimer ce preset.");
      message.classList.add("is-error");
    }
    updatePresetShell(container, { selectedId: presetId });
  }
}

function normalizePresetRecord(preset) {
  const id = String(preset?.id || "").trim();
  const name = String(preset?.name || "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    graphOrder: normalizeSettings({
      graphOrder: Array.isArray(preset?.graph_order)
        ? preset.graph_order
        : Array.isArray(preset?.graphOrder)
          ? preset.graphOrder
          : []
    }).graphOrder
  };
}

function setPreviewGraph(container, graph) {
  const safeGraph = String(graph || "").trim();
  if (editorState.previewGraph === safeGraph) return;

  editorState.previewGraph = safeGraph;
  const host = container.querySelector("[data-hover-preview]");
  if (!host) return;
  host.innerHTML = renderHoverPreview(safeGraph);
  bindGraphAssetFallbacks(host);
}

function createPresetId() {
  return `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function updateDropTarget(board, clientX = 0, clientY = 0) {
  clearDropTargets(board);

  const indicator = board.querySelector("[data-drop-indicator]");
  const selectedTiles = [...board.querySelectorAll('.phono-graph-tile[data-selected="true"]:not(.is-dragging)')];
  if (!selectedTiles.length) {
    board.dataset.dropIndex = "0";
    positionDropIndicator(board, indicator, {
      left: 4,
      top: 8,
      height: getFallbackTileHeight(board)
    });
    return;
  }

  const rows = buildSelectedRows(selectedTiles);
  if (!rows.length) {
    board.dataset.dropIndex = String(selectedTiles.length);
    return;
  }

  const row = pickDropRow(rows, clientY);
  let dropIndex = row.startIndex + row.tiles.length;
  let anchorTile = row.tiles[row.tiles.length - 1] || null;
  let edge = "after";

  for (let index = 0; index < row.tiles.length; index += 1) {
    const tile = row.tiles[index];
    const rect = tile.getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) {
      dropIndex = row.startIndex + index;
      anchorTile = tile;
      edge = "before";
      break;
    }
  }

  board.dataset.dropIndex = String(dropIndex);
  positionIndicatorForTile(board, indicator, anchorTile, edge);
}

function clearDropTargets(board) {
  delete board.dataset.dropIndex;
  const indicator = board.querySelector("[data-drop-indicator]");
  if (indicator) {
    indicator.hidden = true;
    indicator.style.removeProperty("left");
    indicator.style.removeProperty("top");
    indicator.style.removeProperty("height");
  }
}

function buildSelectedRows(selectedTiles) {
  const rows = [];
  let currentRow = null;

  selectedTiles.forEach((tile, index) => {
    const rect = tile.getBoundingClientRect();
    if (!currentRow || Math.abs(rect.top - currentRow.top) > Math.max(6, rect.height * 0.35)) {
      currentRow = {
        top: rect.top,
        bottom: rect.bottom,
        startIndex: index,
        tiles: [tile]
      };
      rows.push(currentRow);
      return;
    }

    currentRow.bottom = Math.max(currentRow.bottom, rect.bottom);
    currentRow.tiles.push(tile);
  });

  return rows;
}

function pickDropRow(rows, clientY = 0) {
  if (rows.length === 1) return rows[0];

  let bestRow = rows[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  rows.forEach((row) => {
    const centerY = (row.top + row.bottom) / 2;
    const distance = Math.abs(clientY - centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRow = row;
    }
  });

  return bestRow;
}

function positionIndicatorForTile(board, indicator, tile, edge = "before") {
  if (!indicator || !tile) return;

  const boardRect = board.getBoundingClientRect();
  const rect = tile.getBoundingClientRect();
  const left = edge === "after"
    ? rect.right - boardRect.left + 4
    : rect.left - boardRect.left - 8;

  positionDropIndicator(board, indicator, {
    left,
    top: rect.top - boardRect.top - 4,
    height: rect.height + 8
  });
}

function positionDropIndicator(board, indicator, { left = 0, top = 0, height = 0 } = {}) {
  if (!indicator) return;

  indicator.hidden = false;
  indicator.style.left = `${Math.max(2, left)}px`;
  indicator.style.top = `${Math.max(2, top)}px`;
  indicator.style.height = `${Math.max(24, height)}px`;
}

function getFallbackTileHeight(board) {
  const probe = board.querySelector('.phono-graph-tile');
  if (probe) {
    return probe.getBoundingClientRect().height + 8;
  }

  const width = board.getBoundingClientRect().width;
  const innerWidth = Math.max(120, width - 20);
  const tileWidth = innerWidth / 8;
  return (tileWidth * 733 / 1109) + 8;
}

function createDragGhost(tile, image) {
  if (!(tile instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return null;

  const tileRect = tile.getBoundingClientRect();
  const width = Math.max(48, Math.round(tileRect.width));
  const height = Math.max(32, Math.round(tileRect.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  if (image.complete && image.naturalWidth > 0) {
    ctx.globalAlpha = 0.4;
    ctx.drawImage(image, 0, 0, width, height);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(92, 227, 106, .98)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  return canvas;
}

function suppressNextClick(container) {
  container.dataset.phonoSuppressClickUntil = String(Date.now() + CLICK_SUPPRESSION_MS);
}

function isClickSuppressed(container) {
  const until = Number(container.dataset.phonoSuppressClickUntil || 0);
  return Number.isFinite(until) && Date.now() < until;
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-phono-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.phonoConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
