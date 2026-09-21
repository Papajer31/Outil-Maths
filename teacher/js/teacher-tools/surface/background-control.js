import { createColorPicker, normalizeColorPickerValue } from "../../../../shared/color-picker.js";
import { escapeAttr, escapeHtml } from "../../dashboard/text-utils.js";
import { renderActionButton, renderIconButton, renderSelectControl } from "../ui/controls.js";
import {
  DEFAULT_SCENE_BACKGROUND_COLOR,
  DEFAULT_SCENE_BACKGROUND_IMAGE_DISPLAY,
  DEFAULT_SCENE_PATTERN_COLOR,
  EDITABLE_BACKGROUND_SCALE_MAX,
  EDITABLE_BACKGROUND_SCALE_MIN,
  EDITABLE_BACKGROUND_SCALE_STEP,
  SCENE_BACKGROUND_IMAGE_DISPLAY_OPTIONS,
  SCENE_BACKGROUND_MODE_COLOR,
  SCENE_BACKGROUND_MODE_IMAGE,
  SCENE_BACKGROUND_MODE_PRESET,
  SCENE_BACKGROUND_OPTIONS,
  SCENE_EDITABLE_BACKGROUND_OPTIONS,
  createBackgroundObjectUrl,
  getSceneBackgroundOption,
  normalizeBackgroundImageDisplay,
  normalizeSceneBackgroundState
} from "../widgets/background/tool.js";
import { prepareImageFilePayload, prepareImageUrlPayload } from "../apps/image/source.js";
import {
  SURFACE_BACKGROUND_SCOPE_PAGE,
  SURFACE_BACKGROUND_SCOPE_SHARED,
  normalizeSurfaceState
} from "./state.js";

const CUSTOM_COLOR_VALUE = "__custom-color";
const CUSTOM_IMAGE_VALUE = "__custom-image";
const SNAP_BACKGROUNDS = new Set(["seyes", "small-grid", "lines", "dotted", "dotted-60"]);

function getBackgroundSelectValue(background){
  const state = normalizeSceneBackgroundState(background);
  if (state.backgroundMode === SCENE_BACKGROUND_MODE_COLOR) return CUSTOM_COLOR_VALUE;
  if (state.backgroundMode === SCENE_BACKGROUND_MODE_IMAGE) return CUSTOM_IMAGE_VALUE;
  return state.background;
}

function getBackgroundGroups(){
  const regular = SCENE_BACKGROUND_OPTIONS.filter((item) => item.id === "white" || item.id === "black");
  const decor = SCENE_BACKGROUND_OPTIONS.filter((item) => !["white", "black"].includes(item.id));
  return [
    {
      label: "Basique",
      options: [
        ...regular.map((item) => ({ value: item.id, label: item.label })),
        { value: CUSTOM_COLOR_VALUE, label: "Couleur unie…" }
      ]
    },
    {
      label: "Décors",
      options: decor.map((item) => ({ value: item.id, label: item.label }))
    },
    {
      label: "Papiers",
      options: SCENE_EDITABLE_BACKGROUND_OPTIONS.map((item) => ({ value: item.id, label: item.label }))
    },
    {
      label: "Personnel",
      options: [{ value: CUSTOM_IMAGE_VALUE, label: "Image personnalisée…" }]
    }
  ];
}

function getEditableOption(backgroundId){
  return SCENE_EDITABLE_BACKGROUND_OPTIONS.find((item) => item.id === backgroundId) || null;
}

function formatScale(value){
  const number = Number(value);
  return `${Math.round((Number.isFinite(number) ? number : 1) * 100)} %`;
}

function buildPresetPatch(backgroundId, current){
  const option = getSceneBackgroundOption(backgroundId);
  const patch = {
    backgroundMode: SCENE_BACKGROUND_MODE_PRESET,
    background: backgroundId,
    backgroundPreset: backgroundId,
    backgroundPresetSource: option?.kind === "image" ? String(option.source || "") : ""
  };
  if (option?.kind === "color") {
    patch.backgroundColor = normalizeColorPickerValue(option.color, DEFAULT_SCENE_BACKGROUND_COLOR);
  }
  return normalizeSceneBackgroundState({ ...current, ...patch });
}

export function createSurfaceBackgroundPanel({
  host,
  getPageSurface,
  getSharedBackground,
  setBackgroundScope,
  setPageBackground,
  setSharedBackground,
  setSnapEnabled,
  supportsSnap = false,
  showToast,
  onClose
} = {}){
  if (!host) return { render(){}, destroy(){} };

  let pendingCustomImage = false;

  function getContext(){
    const surface = normalizeSurfaceState(getPageSurface?.());
    const sharedBackground = normalizeSceneBackgroundState(getSharedBackground?.());
    const isShared = surface.backgroundScope === SURFACE_BACKGROUND_SCOPE_SHARED;
    return {
      surface,
      sharedBackground,
      isShared,
      background: isShared ? sharedBackground : surface.background
    };
  }

  function commitBackground(nextBackground, options = {}){
    const { isShared } = getContext();
    if (isShared) setSharedBackground?.(normalizeSceneBackgroundState(nextBackground), options);
    else setPageBackground?.(normalizeSceneBackgroundState(nextBackground), options);
  }

  async function setBackgroundImageFromFile(file){
    if (!file) return;
    const { background } = getContext();
    try {
      const payload = await prepareImageFilePayload(file);
      const source = createBackgroundObjectUrl(payload.blob);
      if (!source) throw new Error("Impossible de charger cette image.");
      pendingCustomImage = false;
      commitBackground({
        ...background,
        backgroundMode: SCENE_BACKGROUND_MODE_IMAGE,
        backgroundPresetSource: "",
        backgroundImageSource: source,
        backgroundImageKind: "file",
        backgroundImageDisplay: background.backgroundImageDisplay || DEFAULT_SCENE_BACKGROUND_IMAGE_DISPLAY,
        backgroundImageName: payload.imageName || "Image locale",
        backgroundImageNaturalWidth: payload.naturalWidth,
        backgroundImageNaturalHeight: payload.naturalHeight
      });
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger cette image.", { isError: true });
    }
  }

  async function setBackgroundImageFromUrl(){
    const input = host.querySelector("#ttSurfaceBackgroundUrl");
    const { background } = getContext();
    try {
      const payload = await prepareImageUrlPayload(input?.value);
      pendingCustomImage = false;
      commitBackground({
        ...background,
        backgroundMode: SCENE_BACKGROUND_MODE_IMAGE,
        backgroundPresetSource: "",
        backgroundImageSource: payload.source,
        backgroundImageKind: "url",
        backgroundImageDisplay: background.backgroundImageDisplay || DEFAULT_SCENE_BACKGROUND_IMAGE_DISPLAY,
        backgroundImageName: payload.imageName || payload.source,
        backgroundImageNaturalWidth: payload.naturalWidth,
        backgroundImageNaturalHeight: payload.naturalHeight
      });
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger cette URL d'image.", { isError: true });
    }
  }

  function render(){
    const { surface, isShared, background } = getContext();
    const selectedValue = pendingCustomImage ? CUSTOM_IMAGE_VALUE : getBackgroundSelectValue(background);
    const editableOption = background.backgroundMode === SCENE_BACKGROUND_MODE_PRESET
      ? getEditableOption(background.background)
      : null;
    const scaleValue = editableOption ? Number(background[editableOption.scaleKey]) || 1 : 1;
    const canSnap = supportsSnap && background.backgroundMode === SCENE_BACKGROUND_MODE_PRESET && SNAP_BACKGROUNDS.has(background.background);
    const hasCustomImage = background.backgroundMode === SCENE_BACKGROUND_MODE_IMAGE && Boolean(background.backgroundImageSource);

    host.innerHTML = `
      <div class="tt-surface-popover-head">
        <div><span class="dashboard-material-icon" aria-hidden="true">wallpaper</span><strong>Fond</strong></div>
        ${renderIconButton({ id: "ttSurfaceBackgroundClose", label: "Fermer", icon: "close" })}
      </div>
      <div class="tt-surface-popover-body">
        ${renderSelectControl({
          id: "ttSurfaceBackgroundScope",
          label: "Portée",
          value: isShared ? SURFACE_BACKGROUND_SCOPE_SHARED : SURFACE_BACKGROUND_SCOPE_PAGE,
          options: [
            { value: SURFACE_BACKGROUND_SCOPE_PAGE, label: "Cette page" },
            { value: SURFACE_BACKGROUND_SCOPE_SHARED, label: "Fond partagé" }
          ]
        })}
        ${renderSelectControl({
          id: "ttSurfaceBackgroundType",
          label: "Fond",
          value: selectedValue,
          groups: getBackgroundGroups()
        })}

        ${background.backgroundMode === SCENE_BACKGROUND_MODE_COLOR ? `
          <div class="tt-ui-field"><span class="tt-ui-field-label">Couleur</span><div id="ttSurfaceBackgroundBaseColor" class="tt-surface-color-picker"></div></div>
        ` : ""}

        ${editableOption ? `
          <div class="tt-surface-paper-options">
            <div class="tt-surface-color-row">
              <div class="tt-ui-field"><span class="tt-ui-field-label">Papier</span><div id="ttSurfaceBackgroundBaseColor" class="tt-surface-color-picker"></div></div>
              <div class="tt-ui-field"><span class="tt-ui-field-label">Traits</span><div id="ttSurfaceBackgroundPatternColor" class="tt-surface-color-picker"></div></div>
            </div>
            <label class="tt-ui-field" for="ttSurfaceBackgroundScale">
              <span class="tt-ui-field-label">${escapeHtml(editableOption.sliderLabel || "Échelle")}</span>
              <div class="tt-ui-range-row">
                <input id="ttSurfaceBackgroundScale" type="range" min="${EDITABLE_BACKGROUND_SCALE_MIN}" max="${EDITABLE_BACKGROUND_SCALE_MAX}" step="${EDITABLE_BACKGROUND_SCALE_STEP}" value="${escapeAttr(scaleValue)}">
                <strong id="ttSurfaceBackgroundScaleValue">${escapeHtml(formatScale(scaleValue))}</strong>
              </div>
            </label>
          </div>
        ` : ""}

        ${selectedValue === CUSTOM_IMAGE_VALUE ? `
          <div class="tt-surface-image-options">
            <div class="tt-surface-image-actions">
              <label class="tt-ui-button is-primary tt-image-file-btn">
                <span class="dashboard-material-icon" aria-hidden="true">upload_file</span><span>Choisir une image</span>
                <input id="ttSurfaceBackgroundFile" type="file" accept="image/*">
              </label>
              <div class="tt-surface-url-row">
                <input id="ttSurfaceBackgroundUrl" class="tt-ui-input" type="url" inputmode="url" placeholder="https://…" value="${hasCustomImage && background.backgroundImageKind === "url" ? escapeAttr(background.backgroundImageSource) : ""}">
                ${renderActionButton({ id: "ttSurfaceBackgroundLoadUrl", label: "Charger", className: "is-primary" })}
              </div>
            </div>
            ${renderSelectControl({
              id: "ttSurfaceBackgroundImageDisplay",
              label: "Ajustement",
              value: normalizeBackgroundImageDisplay(background.backgroundImageDisplay),
              options: SCENE_BACKGROUND_IMAGE_DISPLAY_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
              disabled: !hasCustomImage
            })}
            ${hasCustomImage ? `
              <div class="tt-surface-image-summary">
                <div><strong>${escapeHtml(background.backgroundImageName || "Image d’arrière-plan")}</strong><span>${background.backgroundImageNaturalWidth && background.backgroundImageNaturalHeight ? `${background.backgroundImageNaturalWidth} × ${background.backgroundImageNaturalHeight}` : "Image chargée"}</span></div>
                ${renderActionButton({ id: "ttSurfaceBackgroundClearImage", label: "Retirer", icon: "delete", className: "is-danger" })}
              </div>
            ` : ""}
          </div>
        ` : ""}

        ${canSnap ? `
          <label class="tt-ui-toggle-row">
            <span><strong>Magnétisme</strong><small>Accrocher les éléments compatibles au papier.</small></span>
            <input id="ttSurfaceSnapEnabled" type="checkbox" ${surface.snap.enabled ? "checked" : ""}>
          </label>
        ` : ""}
      </div>
    `;

    host.querySelector("#ttSurfaceBackgroundClose")?.addEventListener("click", () => onClose?.());
    host.querySelector("#ttSurfaceBackgroundScope")?.addEventListener("change", (event) => {
      setBackgroundScope?.(event.currentTarget.value);
    });
    host.querySelector("#ttSurfaceBackgroundType")?.addEventListener("change", (event) => {
      const value = String(event.currentTarget.value || "");
      const { background: current } = getContext();
      if (value === CUSTOM_COLOR_VALUE) {
        pendingCustomImage = false;
        commitBackground(normalizeSceneBackgroundState({
          ...current,
          backgroundMode: SCENE_BACKGROUND_MODE_COLOR,
          backgroundColor: current.backgroundColor || DEFAULT_SCENE_BACKGROUND_COLOR,
          backgroundPresetSource: ""
        }));
        return;
      }
      if (value === CUSTOM_IMAGE_VALUE) {
        pendingCustomImage = true;
        render();
        return;
      }
      pendingCustomImage = false;
      commitBackground(buildPresetPatch(value, current));
    });

    const baseColorHost = host.querySelector("#ttSurfaceBackgroundBaseColor");
    if (baseColorHost) {
      createColorPicker({
        host: baseColorHost,
        value: background.backgroundColor || DEFAULT_SCENE_BACKGROUND_COLOR,
        label: "Couleur du fond",
        headerLabel: "",
        popup: true,
        onChange(value){ commitBackground({ ...getContext().background, backgroundColor: value }, { renderView: false }); }
      });
    }
    const patternColorHost = host.querySelector("#ttSurfaceBackgroundPatternColor");
    if (patternColorHost) {
      createColorPicker({
        host: patternColorHost,
        value: background.backgroundPatternColor || DEFAULT_SCENE_PATTERN_COLOR,
        label: "Couleur des traits",
        headerLabel: "",
        popup: true,
        onChange(value){ commitBackground({ ...getContext().background, backgroundPatternColor: value }, { renderView: false }); }
      });
    }
    host.querySelector("#ttSurfaceBackgroundScale")?.addEventListener("input", (event) => {
      if (!editableOption) return;
      const value = Number(event.currentTarget.value) || 1;
      const output = host.querySelector("#ttSurfaceBackgroundScaleValue");
      if (output) output.textContent = formatScale(value);
      commitBackground({ ...getContext().background, [editableOption.scaleKey]: value }, { renderView: false });
    });
    host.querySelector("#ttSurfaceBackgroundFile")?.addEventListener("change", (event) => {
      const file = event.currentTarget.files?.[0] || null;
      setBackgroundImageFromFile(file);
      event.currentTarget.value = "";
    });
    host.querySelector("#ttSurfaceBackgroundLoadUrl")?.addEventListener("click", setBackgroundImageFromUrl);
    host.querySelector("#ttSurfaceBackgroundUrl")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") setBackgroundImageFromUrl();
    });
    host.querySelector("#ttSurfaceBackgroundImageDisplay")?.addEventListener("change", (event) => {
      commitBackground({ ...getContext().background, backgroundImageDisplay: normalizeBackgroundImageDisplay(event.currentTarget.value) });
    });
    host.querySelector("#ttSurfaceBackgroundClearImage")?.addEventListener("click", () => {
      const current = getContext().background;
      pendingCustomImage = false;
      commitBackground(normalizeSceneBackgroundState({
        ...current,
        backgroundMode: SCENE_BACKGROUND_MODE_PRESET,
        background: "white",
        backgroundPreset: "white",
        backgroundPresetSource: "",
        backgroundImageSource: "",
        backgroundImageKind: "",
        backgroundImageDisplay: DEFAULT_SCENE_BACKGROUND_IMAGE_DISPLAY,
        backgroundImageName: "",
        backgroundImageNaturalWidth: 0,
        backgroundImageNaturalHeight: 0
      }));
    });
    host.querySelector("#ttSurfaceSnapEnabled")?.addEventListener("change", (event) => {
      setSnapEnabled?.(event.currentTarget.checked === true);
    });
  }

  render();
  return { render, destroy(){ host.innerHTML = ""; } };
}
