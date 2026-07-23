import { RUNTIME_VIEWPORT_PROFILES } from "../shared/responsive-profiles.js";
import { adoptAdminDraftRuntimePayloadForTab } from "../shared/admin-draft-runtime-storage.js";

const PRESETS = RUNTIME_VIEWPORT_PROFILES;

const urlParams = new URLSearchParams(window.location.search || "");
const adminDraftToken = String(urlParams.get("adminDraftToken") || "").trim();
const adminDraftRoute = adminDraftToken ? buildAdminDraftRoute(adminDraftToken) : "";

const state = {
  width: 1280,
  height: 1024,
  label: "1280×1024",
  meta: "Écran 5:4",
  route: adminDraftRoute || "#/home"
};

const presetButtons = document.getElementById("presetButtons");
const customWidth = document.getElementById("customWidth");
const customHeight = document.getElementById("customHeight");
const applyCustomBtn = document.getElementById("applyCustomBtn");
const routeInput = document.getElementById("routeInput");
const reloadBtn = document.getElementById("reloadBtn");
const resetRouteBtn = document.getElementById("resetRouteBtn");
const restartSessionBtn = document.getElementById("restartSessionBtn");
const frameShell = document.getElementById("frameShell");
const frameRuler = document.getElementById("frameRuler");
const runtimeFrame = document.getElementById("runtimeFrame");
const currentLabel = document.getElementById("currentLabel");
const currentMeta = document.getElementById("currentMeta");
const iframeSizeBadge = document.getElementById("iframeSizeBadge");

boot();

function boot(){
  if (adminDraftToken) {
    adoptAdminDraftRuntimePayloadForTab(adminDraftToken);
  }
  if (routeInput) routeInput.value = state.route;
  if (adminDraftToken) {
    document.body.classList.add("vp-admin-draft-mode");
    const routeTitle = document.getElementById("vpRouteTitle");
    if (routeTitle) routeTitle.textContent = "Activité testée";
  }
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
  restartSessionBtn?.addEventListener("click", restartRuntimeSession);
  resetRouteBtn?.addEventListener("click", () => {
    state.route = adminDraftRoute || "#/home";
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

function restartRuntimeSession(){
  reloadRuntime({ cacheBust: true });
}

function reloadRuntime({ cacheBust = false } = {}){
  if (!runtimeFrame) return;
  const route = normalizeRoute(routeInput?.value || state.route || "#/home");
  state.route = route;
  if (routeInput) routeInput.value = route;

  const url = new URL("../index.html", window.location.href);
  url.searchParams.set("devViewport", "1");
  url.searchParams.set("devViewportWidth", String(state.width));
  url.searchParams.set("devViewportHeight", String(state.height));
  if (cacheBust) {
    url.searchParams.set("devRestart", String(Date.now()));
  }
  runtimeFrame.src = `${url.pathname}${url.search}${route}`;
}

function buildAdminDraftRoute(token){
  const params = new URLSearchParams();
  params.set("adminDraftToken", token);
  params.set("catalogTest", "1");
  params.set("shared", "1");
  params.set("classCode", "ADMINTEST");
  params.set("configName", "__admin_draft_test__");
  return `#/session?${params.toString()}`;
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
