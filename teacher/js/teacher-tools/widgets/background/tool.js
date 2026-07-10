import { defineTeacherTool } from "../../core/tool-contract.js";
import { createColorPicker, normalizeColorPickerValue } from "../../../../../shared/color-picker.js";
import { SHARED_BACKGROUND_PRESETS } from "../../../../../shared/backgrounds/presets.js";
import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import {
  prepareImageFilePayload,
  prepareImageUrlPayload
} from "../image/source.js";

export const BACKGROUND_WIDGET_ID = "scene-background";
export const SCENE_BACKGROUND_MODE_PRESET = "preset";
export const SCENE_BACKGROUND_MODE_COLOR = "color";
export const SCENE_BACKGROUND_MODE_IMAGE = "image";
export const DEFAULT_SCENE_BACKGROUND_ID = "white";
export const DEFAULT_SCENE_BACKGROUND_COLOR = "#ffffff";
export const DEFAULT_SCENE_PATTERN_COLOR = "#bac2f3";
export const SCENE_BACKGROUND_IMAGE_DISPLAY_FILL = "fill";
export const SCENE_BACKGROUND_IMAGE_DISPLAY_CONTAIN = "contain";
export const SCENE_BACKGROUND_IMAGE_DISPLAY_STRETCH = "stretch";
export const SCENE_BACKGROUND_IMAGE_DISPLAY_TILE = "tile";
export const SCENE_BACKGROUND_IMAGE_DISPLAY_CENTER = "center";
export const DEFAULT_SCENE_BACKGROUND_IMAGE_DISPLAY = SCENE_BACKGROUND_IMAGE_DISPLAY_FILL;
export const DEFAULT_EDITABLE_BACKGROUND_SCALE = 1;
export const EDITABLE_BACKGROUND_RENDER_BASE_SCALE = 2.25;
export const EDITABLE_BACKGROUND_SCALE_MIN = 0.5;
export const EDITABLE_BACKGROUND_SCALE_MAX = 2;
export const EDITABLE_BACKGROUND_SCALE_STEP = 0.01;
export const DEFAULT_SEYES_BACKGROUND_SCALE = DEFAULT_EDITABLE_BACKGROUND_SCALE;
export const SEYES_BACKGROUND_RENDER_BASE_SCALE = EDITABLE_BACKGROUND_RENDER_BASE_SCALE;
export const SEYES_BACKGROUND_SCALE_MIN = EDITABLE_BACKGROUND_SCALE_MIN;
export const SEYES_BACKGROUND_SCALE_MAX = EDITABLE_BACKGROUND_SCALE_MAX;
export const SEYES_BACKGROUND_SCALE_STEP = EDITABLE_BACKGROUND_SCALE_STEP;
const SHARED_BACKGROUND_SOURCE_ROOT = "../../../../../shared/backgrounds/";
const SHARED_IMAGE_BACKGROUND_OPTIONS = Object.freeze(
  SHARED_BACKGROUND_PRESETS
    .map(normalizeSharedBackgroundPreset)
    .filter(Boolean)
);

export const SCENE_BACKGROUND_OPTIONS = Object.freeze([
  { id: "space", label: "Espace", kind: "preset" },
  { id: "white", label: "Blanc", kind: "color", color: "#ffffff" },
  { id: "black", label: "Noir", kind: "color", color: "#000000" },
  ...SHARED_IMAGE_BACKGROUND_OPTIONS
]);

export const SCENE_BACKGROUND_IMAGE_DISPLAY_OPTIONS = Object.freeze([
  {
    id: SCENE_BACKGROUND_IMAGE_DISPLAY_FILL,
    label: "Remplir",
    title: "Couvre toute la scène ; l’image peut être rognée.",
    css: { size: "cover", repeat: "no-repeat", position: "center" }
  },
  {
    id: SCENE_BACKGROUND_IMAGE_DISPLAY_CONTAIN,
    label: "Ajuster",
    title: "Affiche toute l’image ; des marges peuvent apparaitre.",
    css: { size: "contain", repeat: "no-repeat", position: "center" }
  },
  {
    id: SCENE_BACKGROUND_IMAGE_DISPLAY_STRETCH,
    label: "Étirer",
    title: "Force l’image à remplir la scène ; elle peut être déformée.",
    css: { size: "100% 100%", repeat: "no-repeat", position: "center" }
  },
  {
    id: SCENE_BACKGROUND_IMAGE_DISPLAY_TILE,
    label: "Vignette",
    title: "Répète l’image comme un motif.",
    css: { size: "auto", repeat: "repeat", position: "center" }
  },
  {
    id: SCENE_BACKGROUND_IMAGE_DISPLAY_CENTER,
    label: "Centrer",
    title: "Affiche l’image au centre, à sa taille normale.",
    css: { size: "auto", repeat: "no-repeat", position: "center" }
  }
]);

export const SCENE_EDITABLE_BACKGROUND_OPTIONS = Object.freeze([
  { id: "seyes", label: "Seyès", scaleKey: "seyesScale", sliderLabel: "Échelle des lignes" },
  { id: "small-grid", label: "Petits carreaux", scaleKey: "smallGridScale", sliderLabel: "Échelle des carreaux" },
  { id: "lines", label: "Lignes", scaleKey: "linesScale", sliderLabel: "Échelle des lignes" },
  { id: "dotted", label: "Papier pointé", scaleKey: "dottedScale", sliderLabel: "Échelle des points" },
  { id: "dotted-60", label: "Papier pointé 60°", scaleKey: "dotted60Scale", sliderLabel: "Échelle des points" }
]);

const ALL_SCENE_BACKGROUND_OPTIONS = Object.freeze([
  ...SCENE_BACKGROUND_OPTIONS,
  ...SCENE_EDITABLE_BACKGROUND_OPTIONS
]);

const SCENE_BACKGROUND_MODES = new Set([
  SCENE_BACKGROUND_MODE_PRESET,
  SCENE_BACKGROUND_MODE_COLOR,
  SCENE_BACKGROUND_MODE_IMAGE
]);

const ownedBackgroundObjectUrls = new Map();

function normalizeSharedBackgroundPreset(preset){
  if (!preset || typeof preset !== "object") return null;
  const id = String(preset.id || "").trim();
  const label = String(preset.label || id).trim();
  const explicitSource = normalizeBackgroundImageSource(preset.source);
  const file = normalizeBackgroundImageSource(preset.file || preset.filename);
  const source = resolveSharedBackgroundPresetSource(explicitSource || (file ? `${SHARED_BACKGROUND_SOURCE_ROOT}${file}` : ""));
  if (!id || !label || !source) return null;
  return { id, label, kind: "image", source };
}

function resolveSharedBackgroundPresetSource(source){
  const safeSource = normalizeBackgroundImageSource(source);
  if (!safeSource) return "";
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(safeSource)) return safeSource;
  try {
    return new URL(safeSource, import.meta.url).href;
  } catch {
    return safeSource;
  }
}

function normalizeBackgroundId(value){
  const safeValue = String(value || "").trim();
  return ALL_SCENE_BACKGROUND_OPTIONS.some((item) => item.id === safeValue) ? safeValue : DEFAULT_SCENE_BACKGROUND_ID;
}

function normalizeBackgroundMode(value){
  const safeValue = String(value || "").trim();
  return SCENE_BACKGROUND_MODES.has(safeValue) ? safeValue : SCENE_BACKGROUND_MODE_PRESET;
}

function normalizeBackgroundImageSource(value){
  return String(value || "").trim();
}

function normalizeBackgroundImageKind(value){
  const safeValue = String(value || "").trim();
  return ["file", "url"].includes(safeValue) ? safeValue : "";
}

function normalizeBackgroundImageDimension(value){
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function normalizeBackgroundImageDisplay(value){
  const safeValue = String(value || "").trim();
  return SCENE_BACKGROUND_IMAGE_DISPLAY_OPTIONS.some((item) => item.id === safeValue)
    ? safeValue
    : DEFAULT_SCENE_BACKGROUND_IMAGE_DISPLAY;
}

export function getSceneBackgroundOption(backgroundId){
  const safeId = String(backgroundId || "").trim();
  return SCENE_BACKGROUND_OPTIONS.find((item) => item.id === safeId) || null;
}

export function getSceneBackgroundImagePresetSource(backgroundId, fallbackSource = ""){
  const option = getSceneBackgroundOption(backgroundId);
  return option?.kind === "image" ? String(option.source || "") : normalizeBackgroundImageSource(fallbackSource);
}

export function getBackgroundImageDisplayCss(value){
  const safeValue = normalizeBackgroundImageDisplay(value);
  return SCENE_BACKGROUND_IMAGE_DISPLAY_OPTIONS.find((item) => item.id === safeValue)?.css
    || SCENE_BACKGROUND_IMAGE_DISPLAY_OPTIONS[0].css;
}

function normalizeEditableBackgroundScale(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_EDITABLE_BACKGROUND_SCALE;
  const clamped = Math.max(EDITABLE_BACKGROUND_SCALE_MIN, Math.min(EDITABLE_BACKGROUND_SCALE_MAX, number));
  return Number((Math.round(clamped / EDITABLE_BACKGROUND_SCALE_STEP) * EDITABLE_BACKGROUND_SCALE_STEP).toFixed(2));
}

function formatEditableBackgroundScale(value){
  return `${Math.round(normalizeEditableBackgroundScale(value) * 100)} %`;
}

function getEditableBackgroundOption(backgroundId){
  const safeId = String(backgroundId || "").trim();
  return SCENE_EDITABLE_BACKGROUND_OPTIONS.find((item) => item.id === safeId) || null;
}

function getEditableBackgroundScale(state, backgroundId){
  const option = getEditableBackgroundOption(backgroundId);
  if (!option) return DEFAULT_EDITABLE_BACKGROUND_SCALE;
  return normalizeEditableBackgroundScale(state?.[option.scaleKey]);
}

function isBlob(value){
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function createBackgroundObjectUrl(blob){
  if (!isBlob(blob) || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
  const source = URL.createObjectURL(blob);
  ownedBackgroundObjectUrls.set(source, 1);
  return source;
}

function releaseBackgroundObjectUrl(source){
  if (!source || !ownedBackgroundObjectUrls.has(source)) return;
  const nextCount = Math.max(0, ownedBackgroundObjectUrls.get(source) - 1);
  if (nextCount > 0) {
    ownedBackgroundObjectUrls.set(source, nextCount);
    return;
  }

  ownedBackgroundObjectUrls.delete(source);
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try { URL.revokeObjectURL(source); } catch {}
}

export function normalizeSceneBackgroundState(rawScene = {}){
  const source = rawScene?.scene && typeof rawScene.scene === "object" ? rawScene.scene : rawScene;
  const rawBackground = String(source?.background || source?.backgroundPreset || "").trim();
  const inferredMode = rawBackground === "custom-color"
    ? SCENE_BACKGROUND_MODE_COLOR
    : (rawBackground === "custom-image" ? SCENE_BACKGROUND_MODE_IMAGE : "");
  let backgroundMode = normalizeBackgroundMode(source?.backgroundMode || source?.mode || inferredMode);
  const backgroundImageSource = normalizeBackgroundImageSource(
    source?.backgroundImageSource
      ?? source?.imageSource
      ?? source?.backgroundImage?.source
  );
  const backgroundPresetSource = normalizeBackgroundImageSource(
    source?.backgroundPresetSource
      ?? source?.presetSource
      ?? source?.backgroundSource
  );

  if (backgroundMode === SCENE_BACKGROUND_MODE_IMAGE && !backgroundImageSource) {
    backgroundMode = SCENE_BACKGROUND_MODE_PRESET;
  }

  return {
    background: normalizeBackgroundId(source?.backgroundPreset || source?.preset || rawBackground),
    backgroundMode,
    backgroundPresetSource,
    backgroundColor: normalizeColorPickerValue(source?.backgroundColor, DEFAULT_SCENE_BACKGROUND_COLOR),
    backgroundPatternColor: normalizeColorPickerValue(source?.backgroundPatternColor ?? source?.patternColor, DEFAULT_SCENE_PATTERN_COLOR),
    backgroundImageSource,
    backgroundImageKind: normalizeBackgroundImageKind(
      source?.backgroundImageKind
        ?? source?.imageKind
        ?? source?.backgroundImage?.sourceKind
    ),
    backgroundImageDisplay: normalizeBackgroundImageDisplay(
      source?.backgroundImageDisplay
        ?? source?.backgroundImageFit
        ?? source?.imageDisplay
        ?? source?.imageFit
        ?? source?.backgroundImage?.display
        ?? source?.backgroundImage?.fit
    ),
    backgroundImageName: String(
      source?.backgroundImageName
        ?? source?.imageName
        ?? source?.backgroundImage?.imageName
        ?? ""
    ).trim(),
    backgroundImageNaturalWidth: normalizeBackgroundImageDimension(
      source?.backgroundImageNaturalWidth
        ?? source?.naturalWidth
        ?? source?.backgroundImage?.naturalWidth
    ),
    backgroundImageNaturalHeight: normalizeBackgroundImageDimension(
      source?.backgroundImageNaturalHeight
        ?? source?.naturalHeight
        ?? source?.backgroundImage?.naturalHeight
    ),
    seyesScale: normalizeEditableBackgroundScale(
      source?.seyesScale
        ?? source?.backgroundLineScale
        ?? source?.backgroundScale
    ),
    smallGridScale: normalizeEditableBackgroundScale(source?.smallGridScale),
    linesScale: normalizeEditableBackgroundScale(source?.linesScale),
    dottedScale: normalizeEditableBackgroundScale(source?.dottedScale),
    dotted60Scale: normalizeEditableBackgroundScale(source?.dotted60Scale),
    locked: source?.locked === true || rawScene?.locked === true
  };
}

function renderImageMeta(state){
  const dimensions = state.backgroundImageNaturalWidth && state.backgroundImageNaturalHeight
    ? `${state.backgroundImageNaturalWidth} × ${state.backgroundImageNaturalHeight}`
    : "dimensions inconnues";
  const kind = state.backgroundImageKind === "file" ? "Fichier local" : "URL";
  return `${kind} · ${dimensions}`;
}

function renderBackgroundSwatch(background){
  const source = background?.kind === "image" ? normalizeBackgroundImageSource(background.source) : "";
  return `
    <span
      class="tt-background-option-swatch is-${escapeAttr(background.id)}"
      ${source ? `data-background-swatch-source="${escapeAttr(source)}"` : ""}
      aria-hidden="true"
    ></span>
  `;
}

function applyBackgroundSwatchSources(host){
  host.querySelectorAll("[data-background-swatch-source]").forEach((swatch) => {
    const source = normalizeBackgroundImageSource(swatch.dataset.backgroundSwatchSource);
    if (!source) return;
    swatch.style.backgroundImage = `url("${source.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}")`;
  });
}

function renderBackgroundControl(host, currentBackground, setSceneBackground, showToast){
  if (!host) return;
  const state = normalizeSceneBackgroundState(currentBackground);
  const hasImage = Boolean(state.backgroundImageSource);
  const selectedPreset = state.backgroundMode === SCENE_BACKGROUND_MODE_PRESET
    && SCENE_BACKGROUND_OPTIONS.some((item) => item.id === state.background)
    ? state.background
    : "";
  const selectedEditableBackground = state.backgroundMode === SCENE_BACKGROUND_MODE_PRESET
    && SCENE_EDITABLE_BACKGROUND_OPTIONS.some((item) => item.id === state.background)
    ? state.background
    : "";
  const selectedEditableOption = getEditableBackgroundOption(selectedEditableBackground);
  const selectedEditableScale = getEditableBackgroundScale(state, selectedEditableBackground);
  const selectedImageDisplay = state.backgroundMode === SCENE_BACKGROUND_MODE_IMAGE
    ? normalizeBackgroundImageDisplay(state.backgroundImageDisplay)
    : "";

  function commitSceneBackgroundPatch(patch = {}, options = {}){
    const hasImageSourcePatch = Object.prototype.hasOwnProperty.call(patch, "backgroundImageSource");
    const nextImageSource = hasImageSourcePatch ? normalizeBackgroundImageSource(patch.backgroundImageSource) : state.backgroundImageSource;
    if (hasImageSourcePatch && nextImageSource !== state.backgroundImageSource) {
      releaseBackgroundObjectUrl(state.backgroundImageSource);
    }
    setSceneBackground?.(patch, options);
  }

  async function setBackgroundImageFromFile(file){
    if (!file) return;
    try {
      const payload = await prepareImageFilePayload(file);
      const source = createBackgroundObjectUrl(payload.blob);
      if (!source) throw new Error("Impossible de charger cette image.");
      commitSceneBackgroundPatch({
        backgroundMode: SCENE_BACKGROUND_MODE_IMAGE,
        backgroundPresetSource: "",
        backgroundImageSource: source,
        backgroundImageKind: "file",
        backgroundImageDisplay: state.backgroundImageDisplay,
        backgroundImageName: payload.imageName || "Image locale",
        backgroundImageNaturalWidth: payload.naturalWidth,
        backgroundImageNaturalHeight: payload.naturalHeight
      });
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger cette image.", { isError: true });
    }
  }

  async function setBackgroundImageFromUrl(){
    const input = host?.querySelector("#ttBackgroundUrlInput");
    try {
      const payload = await prepareImageUrlPayload(input?.value);
      commitSceneBackgroundPatch({
        backgroundMode: SCENE_BACKGROUND_MODE_IMAGE,
        backgroundPresetSource: "",
        backgroundImageSource: payload.source,
        backgroundImageKind: "url",
        backgroundImageDisplay: state.backgroundImageDisplay,
        backgroundImageName: payload.imageName || payload.source,
        backgroundImageNaturalWidth: payload.naturalWidth,
        backgroundImageNaturalHeight: payload.naturalHeight
      });
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger cette URL d'image.", { isError: true });
    }
  }

  host.innerHTML = `
    <section class="tt-control-panel tt-control-panel-compact tt-background-control" aria-label="Contrôle de l’arrière-plan">
      <div class="tt-control-panel-head">
        <div>
          <h3>Arrière-plan</h3>
        </div>
      </div>

      <div class="tt-background-form">
        <section class="tt-background-section">
          <div class="tt-background-section-title">
            <span class="dashboard-material-icon" aria-hidden="true">wallpaper</span>
            <span>Presets</span>
          </div>
          <div class="tt-background-preset-color-row">
            <div id="ttBackgroundBaseColorPicker" class="tt-background-color-picker"></div>
          </div>
          <div class="tt-background-control-options" role="radiogroup" aria-label="Choix de l’arrière-plan">
            ${SCENE_BACKGROUND_OPTIONS.map((background) => `
              <button
                class="tt-background-control-option${background.id === selectedPreset ? " is-selected" : ""}"
                type="button"
                role="radio"
                aria-checked="${background.id === selectedPreset ? "true" : "false"}"
                data-background-choice="${escapeAttr(background.id)}"
              >
                ${renderBackgroundSwatch(background)}
                <span>${escapeHtml(background.label)}</span>
              </button>
            `).join("")}
          </div>
        </section>

        <section class="tt-background-section">
          <div class="tt-background-section-title">
            <span class="dashboard-material-icon" aria-hidden="true">tune</span>
            <span>Fond modifiable</span>
          </div>
          <div class="tt-background-editable-list">
            <div class="tt-background-editable-buttons" role="radiogroup" aria-label="Fond modifiable">
              ${SCENE_EDITABLE_BACKGROUND_OPTIONS.map((background) => `
                <button
                  class="tt-background-control-option${background.id === selectedEditableBackground ? " is-selected" : ""}"
                  type="button"
                  role="radio"
                  aria-checked="${background.id === selectedEditableBackground ? "true" : "false"}"
                  data-editable-background-choice="${escapeAttr(background.id)}"
                >
                  ${renderBackgroundSwatch(background)}
                  <span>${escapeHtml(background.label)}</span>
                </button>
              `).join("")}
            </div>
            <div class="tt-background-editable-controls">
              <div id="ttBackgroundPatternColorPicker" class="tt-background-pattern-color-picker"></div>
              <label class="tt-background-scale-control tt-background-scale-control-shared${selectedEditableOption ? "" : " is-disabled"}" for="ttBackgroundEditableScale">
                <span>${escapeHtml(selectedEditableOption?.sliderLabel || "Échelle")}</span>
                <input
                  id="ttBackgroundEditableScale"
                  type="range"
                  min="${EDITABLE_BACKGROUND_SCALE_MIN}"
                  max="${EDITABLE_BACKGROUND_SCALE_MAX}"
                  step="${EDITABLE_BACKGROUND_SCALE_STEP}"
                  value="${escapeAttr(selectedEditableScale)}"
                  ${selectedEditableOption ? "" : "disabled"}
                >
                <strong id="ttBackgroundEditableScaleValue">${escapeHtml(formatEditableBackgroundScale(selectedEditableScale))}</strong>
              </label>
            </div>
          </div>
        </section>

        <section class="tt-background-section">
          <div class="tt-background-section-title">
            <span class="dashboard-material-icon" aria-hidden="true">image</span>
            <span>Image personnalisée</span>
          </div>
          <div class="tt-background-custom-image-line" aria-label="Actions d’image personnalisée">
            <label class="tt-widget-action-btn is-primary tt-image-file-btn">
              <span class="dashboard-material-icon" aria-hidden="true">upload_file</span>
              <span>Choisir une image</span>
              <input id="ttBackgroundFileInput" type="file" accept="image/*">
            </label>
            <span class="tt-background-image-or" aria-hidden="true">OU</span>
            <div class="tt-background-image-url-inline">
              <input id="ttBackgroundUrlInput" type="url" inputmode="url" placeholder="https://…" value="${hasImage && state.backgroundImageKind === "url" ? escapeAttr(state.backgroundImageSource) : ""}">
              <button id="ttBackgroundLoadUrl" class="tt-widget-action-btn is-primary" type="button">Charger</button>
            </div>
          </div>
          <div class="tt-background-image-display-options" role="radiogroup" aria-label="Mode d’affichage de l’image personnalisée">
            ${SCENE_BACKGROUND_IMAGE_DISPLAY_OPTIONS.map((option) => `
              <button
                class="tt-background-image-display-btn${option.id === selectedImageDisplay ? " is-selected" : ""}"
                type="button"
                role="radio"
                aria-checked="${option.id === selectedImageDisplay ? "true" : "false"}"
                title="${escapeAttr(option.title)}"
                data-background-image-display="${escapeAttr(option.id)}"
                ${hasImage ? "" : "disabled"}
              >${escapeHtml(option.label)}</button>
            `).join("")}
          </div>
          ${hasImage ? `
            <div class="tt-image-preview-card${state.backgroundMode === SCENE_BACKGROUND_MODE_IMAGE ? " is-active" : ""}">
              <div class="tt-image-preview-thumb" aria-hidden="true"><img src="${escapeAttr(state.backgroundImageSource)}" alt=""></div>
              <div class="tt-image-preview-meta">
                <strong>${escapeHtml(state.backgroundImageName || "Image d’arrière-plan")}</strong>
                <span>${escapeHtml(renderImageMeta(state))}</span>
              </div>
              <button id="ttBackgroundClearImage" class="tt-widget-action-btn is-danger" type="button">
                <span class="dashboard-material-icon" aria-hidden="true">delete</span>
                <span>Retirer</span>
              </button>
            </div>
          ` : `
            <div class="tt-image-empty-card">
              <strong>Aucune image sélectionnée.</strong>
              <span>Choisis une image locale ou colle l’URL directe d’une image.</span>
            </div>
          `}
        </section>
      </div>
    </section>
  `;

  applyBackgroundSwatchSources(host);

  host.querySelectorAll("[data-background-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextBackground = normalizeBackgroundId(button.dataset.backgroundChoice);
      const nextOption = getSceneBackgroundOption(nextBackground);
      const nextPresetSource = nextOption?.kind === "image" ? normalizeBackgroundImageSource(nextOption.source) : "";
      const patch = {
        backgroundMode: SCENE_BACKGROUND_MODE_PRESET,
        background: nextBackground,
        backgroundPreset: nextBackground,
        backgroundPresetSource: nextPresetSource
      };
      if (nextOption?.kind === "color") {
        patch.backgroundColor = normalizeColorPickerValue(nextOption.color, DEFAULT_SCENE_BACKGROUND_COLOR);
      }
      commitSceneBackgroundPatch(patch);
    });
  });
  host.querySelectorAll("[data-editable-background-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextBackground = normalizeBackgroundId(button.dataset.editableBackgroundChoice);
      commitSceneBackgroundPatch({
        backgroundMode: SCENE_BACKGROUND_MODE_PRESET,
        background: nextBackground,
        backgroundPreset: nextBackground,
        backgroundPresetSource: ""
      });
    });
  });
  host.querySelector("#ttBackgroundEditableScale")?.addEventListener("input", (event) => {
    if (!selectedEditableOption) return;
    const scale = normalizeEditableBackgroundScale(event.currentTarget.value);
    const value = host.querySelector("#ttBackgroundEditableScaleValue");
    if (value) value.textContent = formatEditableBackgroundScale(scale);
    commitSceneBackgroundPatch({ [selectedEditableOption.scaleKey]: scale }, { renderView: false });
  });
  host.querySelectorAll("[data-background-image-display]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!hasImage) return;
      commitSceneBackgroundPatch({
        backgroundMode: SCENE_BACKGROUND_MODE_IMAGE,
        backgroundPresetSource: "",
        backgroundImageDisplay: normalizeBackgroundImageDisplay(button.dataset.backgroundImageDisplay)
      });
    });
  });
  createColorPicker({
    host: host.querySelector("#ttBackgroundBaseColorPicker"),
    value: state.backgroundColor,
    label: "Couleur basique",
    headerLabel: "",
    popup: true,
    onChange(value){
      const currentOption = getSceneBackgroundOption(state.background);
      const patch = { backgroundColor: value };
      if (state.backgroundMode === SCENE_BACKGROUND_MODE_PRESET && currentOption?.kind === "color") {
        host.querySelectorAll("[data-background-choice]").forEach((button) => {
          button.classList.remove("is-selected");
          button.setAttribute("aria-checked", "false");
        });
        patch.backgroundMode = SCENE_BACKGROUND_MODE_COLOR;
        patch.backgroundPresetSource = "";
      }
      commitSceneBackgroundPatch(patch, { renderView: false });
    }
  });
  createColorPicker({
    host: host.querySelector("#ttBackgroundPatternColorPicker"),
    value: state.backgroundPatternColor,
    label: "Couleur du motif",
    headerLabel: "",
    popup: true,
    onChange(value){
      commitSceneBackgroundPatch({ backgroundPatternColor: value }, { renderView: false });
    }
  });
  host.querySelector("#ttBackgroundFileInput")?.addEventListener("change", (event) => {
    const file = event.currentTarget.files?.[0] || null;
    setBackgroundImageFromFile(file);
    event.currentTarget.value = "";
  });
  host.querySelector("#ttBackgroundLoadUrl")?.addEventListener("click", setBackgroundImageFromUrl);
  host.querySelector("#ttBackgroundUrlInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") setBackgroundImageFromUrl();
  });
  host.querySelector("#ttBackgroundClearImage")?.addEventListener("click", () => {
    commitSceneBackgroundPatch({
      backgroundMode: state.backgroundMode === SCENE_BACKGROUND_MODE_IMAGE
        ? SCENE_BACKGROUND_MODE_PRESET
        : state.backgroundMode,
      backgroundImageSource: "",
      backgroundImageKind: "",
      backgroundImageDisplay: DEFAULT_SCENE_BACKGROUND_IMAGE_DISPLAY,
      backgroundImageName: "",
      backgroundImageNaturalWidth: 0,
      backgroundImageNaturalHeight: 0
    });
  });
}

export const backgroundTeacherTool = defineTeacherTool({
  id: "background",
  label: "Arrière-plan",
  icon: "wallpaper",
  description: "Choisir le fond de la scène projetée.",
  hiddenFromPicker: true,
  systemWidget: true,
  defaultLocked: true,

  defaultLayout: { x: 0, y: 0, width: 0.01, height: 0.01 },
  minLayout: { width: 0.01, height: 0.01 },
  interaction: {
    moveMode: "none",
    resize: false,
    canCollapse: false,
    canStage: false
  },

  createInitialState(){
    return {};
  },

  createControlPanel({ host, getSceneBackground, setSceneBackground, showToast } = {}){
    const render = () => renderBackgroundControl(host, getSceneBackground?.(), setSceneBackground, showToast);
    render();
    return { render, destroy(){} };
  },

  renderProjector(){
    return "";
  }
});

export default backgroundTeacherTool;
