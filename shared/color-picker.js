const DEFAULT_COLOR = "#ffffff";

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function toHexByte(value){
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

function parseHexColor(value){
  const raw = String(value || "").trim();
  if (raw.toLowerCase() === "transparent") {
    return { r: 255, g: 255, b: 255, a: 0 };
  }
  const match = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) {
    hex = hex.split("").map((char) => `${char}${char}`).join("");
  }
  const rgbHex = hex.slice(0, 6);
  const alphaHex = hex.length === 8 ? hex.slice(6, 8) : "ff";
  return {
    r: parseInt(rgbHex.slice(0, 2), 16),
    g: parseInt(rgbHex.slice(2, 4), 16),
    b: parseInt(rgbHex.slice(4, 6), 16),
    a: clamp(parseInt(alphaHex, 16) / 255, 0, 1)
  };
}

function parseRgbColor(value){
  const raw = String(value || "").trim();
  const match = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  return {
    r: clamp(parts[0], 0, 255),
    g: clamp(parts[1], 0, 255),
    b: clamp(parts[2], 0, 255),
    a: parts.length >= 4 ? clamp(parts[3], 0, 1) : 1
  };
}

export function parseColorPickerValue(value){
  return parseHexColor(value) || parseRgbColor(value);
}

function rgbToHex({ r, g, b } = {}){
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function formatAlpha(value){
  return String(Math.round(clamp(value, 0, 1) * 100) / 100).replace(/\.0+$/, "");
}

export function formatColorPickerValue(color){
  const safeColor = {
    r: clamp(color?.r, 0, 255),
    g: clamp(color?.g, 0, 255),
    b: clamp(color?.b, 0, 255),
    a: clamp(color?.a ?? 1, 0, 1)
  };
  if (safeColor.a >= 0.995) return rgbToHex(safeColor);
  return `rgba(${Math.round(safeColor.r)}, ${Math.round(safeColor.g)}, ${Math.round(safeColor.b)}, ${formatAlpha(safeColor.a)})`;
}

export function normalizeColorPickerValue(value, fallback = DEFAULT_COLOR){
  const parsed = parseColorPickerValue(value)
    || parseColorPickerValue(fallback)
    || parseColorPickerValue(DEFAULT_COLOR);
  return formatColorPickerValue(parsed);
}

function rgbToHsv({ r, g, b } = {}){
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;

  if (delta) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
}

function hsvToRgb({ h, s, v } = {}){
  const hue = ((clamp(h, 0, 360) % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const value = clamp(v, 0, 1);
  const c = value * saturation;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = value - c;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function createState(value){
  const color = parseColorPickerValue(normalizeColorPickerValue(value));
  const hsv = rgbToHsv(color);
  return {
    ...color,
    ...hsv
  };
}

function getReadableInk({ r, g, b, a } = {}){
  const alpha = clamp(a ?? 1, 0, 1);
  const red = clamp(r, 0, 255);
  const green = clamp(g, 0, 255);
  const blue = clamp(b, 0, 255);
  const mixedRed = red * alpha + 17 * (1 - alpha);
  const mixedGreen = green * alpha + 24 * (1 - alpha);
  const mixedBlue = blue * alpha + 39 * (1 - alpha);
  const luminance = (0.2126 * mixedRed + 0.7152 * mixedGreen + 0.0722 * mixedBlue) / 255;
  return luminance > 0.58 ? "#0f172a" : "#ffffff";
}

function renderColorPickerMarkup(headerLabel = ""){
  return `
    <div class="ui-color-picker" data-color-picker>
      <div class="ui-color-picker-head" aria-hidden="true">
        ${headerLabel ? `<span>${escapeHtml(headerLabel)}</span>` : ""}
      </div>
      <div class="ui-color-picker-body">
        <div class="ui-color-picker-sv" role="slider" aria-label="Saturation et luminosité" tabindex="0">
          <span class="ui-color-picker-thumb"></span>
        </div>
        <div class="ui-color-picker-strip ui-color-picker-alpha" role="slider" aria-label="Opacité" tabindex="0">
          <span class="ui-color-picker-strip-thumb"></span>
        </div>
        <div class="ui-color-picker-strip ui-color-picker-hue" role="slider" aria-label="Teinte" tabindex="0">
          <span class="ui-color-picker-strip-thumb"></span>
        </div>
      </div>
    </div>
  `;
}

export function createColorPicker({ host, value = DEFAULT_COLOR, label = "Couleur", headerLabel = "", popup = false, onChange } = {}){
  if (!host) {
    return { destroy(){} };
  }

  let state = createState(value);
  let activePointerId = null;

  host.innerHTML = popup
    ? `
      <div class="ui-color-picker-control" data-color-picker-control>
        <button class="ui-color-picker-trigger" type="button" aria-expanded="false">
          <span>${escapeHtml(label)}</span>
          <span class="ui-color-picker-trigger-icon" aria-hidden="true">expand_more</span>
        </button>
        <div class="ui-color-picker-popover" hidden>
          ${renderColorPickerMarkup(headerLabel)}
        </div>
      </div>
    `
    : renderColorPickerMarkup(headerLabel);

  const root = host.querySelector("[data-color-picker]");
  const control = host.querySelector("[data-color-picker-control]");
  const trigger = host.querySelector(".ui-color-picker-trigger");
  const popover = host.querySelector(".ui-color-picker-popover");
  const saturationField = host.querySelector(".ui-color-picker-sv");
  const saturationThumb = saturationField?.querySelector(".ui-color-picker-thumb");
  const alphaStrip = host.querySelector(".ui-color-picker-alpha");
  const alphaThumb = alphaStrip?.querySelector(".ui-color-picker-strip-thumb");
  const hueStrip = host.querySelector(".ui-color-picker-hue");
  const hueThumb = hueStrip?.querySelector(".ui-color-picker-strip-thumb");

  function emit(){
    onChange?.(formatColorPickerValue(state));
  }

  function render(){
    const rgb = hsvToRgb(state);
    state = { ...state, ...rgb };
    const colorCss = `rgba(${state.r}, ${state.g}, ${state.b}, ${formatAlpha(state.a)})`;
    const inkCss = getReadableInk(state);

    root?.style.setProperty("--ui-color-picker-hue", String(Math.round(state.h)));
    root?.style.setProperty("--ui-color-picker-rgb", `${state.r}, ${state.g}, ${state.b}`);
    root?.style.setProperty("--ui-color-picker-current-color", colorCss);
    root?.style.setProperty("--ui-color-picker-current-ink", inkCss);
    control?.style.setProperty("--ui-color-picker-current-color", colorCss);
    control?.style.setProperty("--ui-color-picker-current-ink", inkCss);
    if (saturationThumb) {
      saturationThumb.style.left = `${state.s * 100}%`;
      saturationThumb.style.top = `${(1 - state.v) * 100}%`;
    }
    if (alphaThumb) alphaThumb.style.top = `${(1 - state.a) * 100}%`;
    if (hueThumb) hueThumb.style.top = `${(state.h / 360) * 100}%`;
  }

  function updateSaturation(event){
    const rect = saturationField.getBoundingClientRect();
    state.s = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    state.v = 1 - clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    render();
    emit();
  }

  function updateAlpha(event){
    const rect = alphaStrip.getBoundingClientRect();
    state.a = 1 - clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    render();
    emit();
  }

  function updateHue(event){
    const rect = hueStrip.getBoundingClientRect();
    state.h = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1) * 360;
    render();
    emit();
  }

  function bindDrag(element, update){
    if (!element) return;
    element.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      activePointerId = event.pointerId;
      element.setPointerCapture?.(event.pointerId);
      update(event);
      event.preventDefault();
    });
    element.addEventListener("pointermove", (event) => {
      if (activePointerId !== event.pointerId) return;
      update(event);
      event.preventDefault();
    });
    element.addEventListener("pointerup", (event) => {
      if (activePointerId !== event.pointerId) return;
      activePointerId = null;
      element.releasePointerCapture?.(event.pointerId);
    });
    element.addEventListener("pointercancel", (event) => {
      if (activePointerId !== event.pointerId) return;
      activePointerId = null;
      element.releasePointerCapture?.(event.pointerId);
    });
  }

  bindDrag(saturationField, updateSaturation);
  bindDrag(alphaStrip, updateAlpha);
  bindDrag(hueStrip, updateHue);

  trigger?.addEventListener("click", () => {
    const isOpen = popover?.hidden === false;
    if (popover) popover.hidden = isOpen;
    trigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
  });

  control?.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!control.contains(document.activeElement)) {
        if (popover) popover.hidden = true;
        trigger?.setAttribute("aria-expanded", "false");
      }
    }, 0);
  });

  control?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (popover) popover.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.focus();
  });

  render();

  return {
    destroy(){
      host.innerHTML = "";
    }
  };
}
