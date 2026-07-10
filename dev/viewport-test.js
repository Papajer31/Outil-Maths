const PRESETS = Object.freeze([
  { width: 1024, height: 768, label: "1024×768", meta: "Vieux PC 4:3" },
  { width: 1280, height: 1024, label: "1280×1024", meta: "Ordi fond de classe" },
  { width: 1280, height: 800, label: "1280×800", meta: "16:10 / tablette paysage" },
  { width: 1366, height: 768, label: "1366×768", meta: "Portable bas de gamme" },
  { width: 1440, height: 900, label: "1440×900", meta: "16:10 standard" },
  { width: 1920, height: 1080, label: "1920×1080", meta: "Écran moderne 16:9" },
  { width: 1920, height: 1200, label: "1920×1200", meta: "Écran confortable 16:10" }
]);

const state = {
  width: 1280,
  height: 1024,
  label: "1280×1024",
  meta: "Ordi fond de classe",
  route: "#/home"
};

const presetButtons = document.getElementById("presetButtons");
const customWidth = document.getElementById("customWidth");
const customHeight = document.getElementById("customHeight");
const applyCustomBtn = document.getElementById("applyCustomBtn");
const routeInput = document.getElementById("routeInput");
const reloadBtn = document.getElementById("reloadBtn");
const resetRouteBtn = document.getElementById("resetRouteBtn");
const frameShell = document.getElementById("frameShell");
const frameRuler = document.getElementById("frameRuler");
const runtimeFrame = document.getElementById("runtimeFrame");
const currentLabel = document.getElementById("currentLabel");
const currentMeta = document.getElementById("currentMeta");
const iframeSizeBadge = document.getElementById("iframeSizeBadge");

boot();

function boot(){
  renderPresetButtons();
  bindEvents();
  applyViewport(PRESETS[1], { reload: true });
}

function renderPresetButtons(){
  if (!presetButtons) return;
  presetButtons.innerHTML = PRESETS.map((preset, index) => `
    <button class="vp-btn${isCurrentPreset(preset) ? " is-active" : ""}" type="button" data-preset-index="${index}">
      <span>${escapeHtml(preset.label)}</span>
      <small>${escapeHtml(preset.meta)}</small>
    </button>
  `).join("");
}

function bindEvents(){
  presetButtons?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset-index]");
    if (!button) return;
    const preset = PRESETS[Number(button.dataset.presetIndex)];
    if (!preset) return;
    applyViewport(preset, { reload: true });
  });

  applyCustomBtn?.addEventListener("click", () => {
    const width = clampInt(customWidth?.value, 320, 3840, state.width);
    const height = clampInt(customHeight?.value, 320, 2160, state.height);
    applyViewport({
      width,
      height,
      label: `${width}×${height}`,
      meta: "Taille personnalisée"
    }, { reload: false });
  });

  [customWidth, customHeight].forEach((input) => {
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyCustomBtn?.click();
      }
    });
  });

  routeInput?.addEventListener("change", () => {
    state.route = normalizeRoute(routeInput.value || "#/home");
    routeInput.value = state.route;
    reloadRuntime();
  });

  routeInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      routeInput.blur();
    }
  });

  reloadBtn?.addEventListener("click", reloadRuntime);
  resetRouteBtn?.addEventListener("click", () => {
    state.route = "#/home";
    if (routeInput) routeInput.value = state.route;
    reloadRuntime();
  });
}

function applyViewport(preset, { reload = false } = {}){
  state.width = clampInt(preset.width, 320, 3840, 1280);
  state.height = clampInt(preset.height, 320, 2160, 1024);
  state.label = preset.label || `${state.width}×${state.height}`;
  state.meta = preset.meta || "";

  if (customWidth) customWidth.value = String(state.width);
  if (customHeight) customHeight.value = String(state.height);

  if (frameShell) {
    frameShell.style.width = `${state.width}px`;
    frameShell.style.height = `${state.height}px`;
  }

  if (frameRuler) frameRuler.textContent = `${state.width} × ${state.height}`;
  if (currentLabel) currentLabel.textContent = state.label;
  if (currentMeta) currentMeta.textContent = state.meta ? `— ${state.meta}` : "";
  if (iframeSizeBadge) iframeSizeBadge.textContent = `${state.width} × ${state.height}`;

  renderPresetButtons();
  if (reload) reloadRuntime();
}

function reloadRuntime(){
  if (!runtimeFrame) return;
  const route = normalizeRoute(routeInput?.value || state.route || "#/home");
  state.route = route;
  if (routeInput) routeInput.value = route;

  const url = new URL("../index.html", window.location.href);
  url.searchParams.set("devViewport", "1");
  url.searchParams.set("devViewportWidth", String(state.width));
  url.searchParams.set("devViewportHeight", String(state.height));
  runtimeFrame.src = `${url.pathname}${url.search}${route}`;
}

function normalizeRoute(value){
  const raw = String(value || "").trim();
  if (!raw) return "#/home";
  if (raw.startsWith("#")) return raw;
  if (raw.startsWith("/")) return `#${raw}`;
  return `#/${raw.replace(/^#?\/?/, "")}`;
}

function isCurrentPreset(preset){
  return Number(preset.width) === Number(state.width) && Number(preset.height) === Number(state.height);
}

function clampInt(value, min, max, fallback){
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
