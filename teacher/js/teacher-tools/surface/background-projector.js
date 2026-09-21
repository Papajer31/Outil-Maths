import {
  EDITABLE_BACKGROUND_RENDER_BASE_SCALE,
  getBackgroundImageDisplayCss,
  getSceneBackgroundImagePresetSource,
  normalizeSceneBackgroundState
} from "../widgets/background/tool.js";
import { normalizeColorPickerValue } from "../../../../shared/color-picker.js";
import { mountStudentStarDrift, renderStudentStars } from "../../../../student/student-stars.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
function formatCssNumber(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number(number.toFixed(2)).toString();
}
function formatSvgAttribute(value){
  return String(value || "").replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
function formatCssUrl(value){
  const source = String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "");
  return `url("${source}")`;
}
function getEditableBackgroundRenderScale(scale){
  const value = Number(scale);
  return (Number.isFinite(value) && value > 0 ? value : 1) * EDITABLE_BACKGROUND_RENDER_BASE_SCALE;
}
function getPatternColor(background){ return normalizeColorPickerValue(background?.backgroundPatternColor, "#bac2f3"); }
function getBaseColor(background){ return normalizeColorPickerValue(background?.backgroundColor, "#ffffff"); }
function getPaperDotRadius(scale){ return clamp(1.75 * Math.sqrt(scale), 1.8, 3.8); }

function buildSeyes(background){
  const scale = getEditableBackgroundRenderScale(background.seyesScale);
  const major = 32 * scale;
  const minor = 8 * scale;
  const minorLines = [];
  for (let y = minor; y < major - 0.01; y += minor) {
    minorLines.push(`<line class="ttp-svg-paper-line is-seyes-minor" x1="0" y1="${formatCssNumber(y)}" x2="${formatCssNumber(major)}" y2="${formatCssNumber(y)}"></line>`);
  }
  const size = formatCssNumber(major);
  return {
    signature: `seyes:${size}:${getBaseColor(background)}:${getPatternColor(background)}`,
    content: `<defs><pattern id="ttpSurfacePattern" width="${size}" height="${size}" patternUnits="userSpaceOnUse" overflow="visible"><rect width="${size}" height="${size}" fill="${formatSvgAttribute(getBaseColor(background))}"></rect>${minorLines.join("")}<line class="ttp-svg-paper-line is-seyes-major" x1="0" y1="0" x2="${size}" y2="0"></line><line class="ttp-svg-paper-line is-seyes-vertical" x1="0" y1="0" x2="0" y2="${size}"></line></pattern></defs><rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpSurfacePattern)"></rect>`
  };
}
function buildGrid(background){
  const size = formatCssNumber(20 * getEditableBackgroundRenderScale(background.smallGridScale));
  return {
    signature: `grid:${size}:${getBaseColor(background)}:${getPatternColor(background)}`,
    content: `<defs><pattern id="ttpSurfacePattern" width="${size}" height="${size}" patternUnits="userSpaceOnUse" overflow="visible"><rect width="${size}" height="${size}" fill="${formatSvgAttribute(getBaseColor(background))}"></rect><path class="ttp-svg-paper-line is-grid" d="M 0 0 H ${size} M 0 0 V ${size}"></path></pattern></defs><rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpSurfacePattern)"></rect>`
  };
}
function buildLines(background){
  const size = formatCssNumber(32 * getEditableBackgroundRenderScale(background.linesScale));
  return {
    signature: `lines:${size}:${getBaseColor(background)}:${getPatternColor(background)}`,
    content: `<defs><pattern id="ttpSurfacePattern" width="100" height="${size}" patternUnits="userSpaceOnUse"><rect width="100" height="${size}" fill="${formatSvgAttribute(getBaseColor(background))}"></rect><line class="ttp-svg-paper-line is-lines" x1="0" y1="0" x2="100" y2="0"></line></pattern></defs><rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpSurfacePattern)"></rect>`
  };
}
function buildDots(background){
  const scale = getEditableBackgroundRenderScale(background.dottedScale);
  const size = 20 * scale;
  const radius = getPaperDotRadius(scale);
  return {
    signature: `dots:${size}:${getBaseColor(background)}:${getPatternColor(background)}`,
    content: `<defs><pattern id="ttpSurfacePattern" width="${formatCssNumber(size)}" height="${formatCssNumber(size)}" patternUnits="userSpaceOnUse"><rect width="${formatCssNumber(size)}" height="${formatCssNumber(size)}" fill="${formatSvgAttribute(getBaseColor(background))}"></rect><circle class="ttp-svg-paper-dot" cx="${formatCssNumber(size/2)}" cy="${formatCssNumber(size/2)}" r="${formatCssNumber(radius)}"></circle></pattern></defs><rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpSurfacePattern)"></rect>`
  };
}
function buildDots60(background){
  const scale = getEditableBackgroundRenderScale(background.dotted60Scale);
  const x = 20 * scale;
  const y = x * 0.8660254;
  const w = x * 2;
  const h = y * 2;
  const r = getPaperDotRadius(scale);
  const dots = [[x*.25,y*.5],[x*1.25,y*.5],[x*.75,y*1.5],[x*1.75,y*1.5]]
    .map(([cx,cy]) => `<circle class="ttp-svg-paper-dot" cx="${formatCssNumber(cx)}" cy="${formatCssNumber(cy)}" r="${formatCssNumber(r)}"></circle>`).join("");
  return {
    signature: `dots60:${w}:${h}:${getBaseColor(background)}:${getPatternColor(background)}`,
    content: `<defs><pattern id="ttpSurfacePattern" width="${formatCssNumber(w)}" height="${formatCssNumber(h)}" patternUnits="userSpaceOnUse"><rect width="${formatCssNumber(w)}" height="${formatCssNumber(h)}" fill="${formatSvgAttribute(getBaseColor(background))}"></rect>${dots}</pattern></defs><rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpSurfacePattern)"></rect>`
  };
}
function getPatternMarkup(background){
  if (background.backgroundMode !== "preset") return null;
  if (background.background === "seyes") return buildSeyes(background);
  if (background.background === "small-grid") return buildGrid(background);
  if (background.background === "lines") return buildLines(background);
  if (background.background === "dotted") return buildDots(background);
  if (background.background === "dotted-60") return buildDots60(background);
  return null;
}

export function createSurfaceBackgroundProjector({ stage, starfieldHost } = {}){
  let svg = null;
  let starfieldCleanup = null;

  function ensureSvg(){
    if (!stage) return null;
    if (svg?.isConnected) return svg;
    svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("ttp-stage-background-svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("preserveAspectRatio", "none");
    stage.insertBefore(svg, stage.firstChild);
    return svg;
  }

  function syncStars(background){
    if (!starfieldHost) return;
    const active = background.backgroundMode === "preset" && background.background === "space";
    starfieldHost.hidden = !active;
    if (!active) {
      starfieldCleanup?.();
      starfieldCleanup = null;
      return;
    }
    if (!starfieldHost.firstElementChild) starfieldHost.innerHTML = renderStudentStars("global");
    if (!starfieldCleanup) starfieldCleanup = mountStudentStarDrift(starfieldHost, "global", { measureFromLayout: true });
  }

  function render(rawBackground = {}){
    if (!stage) return;
    const background = normalizeSceneBackgroundState(rawBackground);
    const mode = background.backgroundMode;
    const datasetBackground = mode === "color" ? "custom-color" : (mode === "image" ? "custom-image" : background.background);
    const presetImage = mode === "preset" ? getSceneBackgroundImagePresetSource(background.background, background.backgroundPresetSource) : "";
    const customImage = mode === "image" ? background.backgroundImageSource : "";
    const imageSource = customImage || presetImage;
    const display = getBackgroundImageDisplayCss(customImage ? background.backgroundImageDisplay : "fill");

    stage.dataset.background = datasetBackground;
    stage.style.setProperty("--ttp-scene-background-color", background.backgroundColor);
    if (imageSource) {
      stage.dataset.backgroundKind = "image";
      stage.style.setProperty("--ttp-scene-background-image", formatCssUrl(imageSource));
      stage.style.setProperty("--ttp-scene-background-size", display.size);
      stage.style.setProperty("--ttp-scene-background-repeat", display.repeat);
      stage.style.setProperty("--ttp-scene-background-position", display.position);
    } else {
      delete stage.dataset.backgroundKind;
      ["--ttp-scene-background-image","--ttp-scene-background-size","--ttp-scene-background-repeat","--ttp-scene-background-position"].forEach((name) => stage.style.removeProperty(name));
    }

    const pattern = getPatternMarkup(background);
    const node = ensureSvg();
    if (node) {
      node.style.setProperty("--ttp-svg-pattern-color", getPatternColor(background));
      if (pattern) {
        if (node.dataset.patternSignature !== pattern.signature) {
          node.innerHTML = pattern.content;
          node.dataset.patternSignature = pattern.signature;
        }
        node.hidden = false;
      } else {
        node.innerHTML = "";
        node.dataset.patternSignature = "";
        node.hidden = true;
      }
    }
    syncStars(background);
  }

  function destroy(){
    starfieldCleanup?.();
    starfieldCleanup = null;
    svg?.remove?.();
    svg = null;
  }

  return { render, destroy };
}
