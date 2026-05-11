import { COMMON_HELP_CONTENT, mergeHelpContent } from "./help-content.js";

export const HELP_CONTEXTUAL_STORAGE_KEY = "teacher.helpBubblesEnabled";

let activePopover = null;
let activeTrigger = null;
let activeRoot = null;
let activeContentRegistry = COMMON_HELP_CONTENT;
let listenersBound = false;

function readStorageValue(){
  try {
    return window.localStorage?.getItem(HELP_CONTEXTUAL_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStorageValue(enabled){
  try {
    window.localStorage?.setItem(HELP_CONTEXTUAL_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // préférence non critique : on ignore les erreurs localStorage
  }
}

export function getContextualHelpEnabled(){
  return readStorageValue() !== "false";
}

export function applyContextualHelpPreference(enabled = getContextualHelpEnabled(), root = document){
  const doc = root?.ownerDocument || document;
  doc.documentElement.classList.toggle("help-contextual-disabled", !enabled);
  doc.body?.classList.toggle("help-contextual-disabled", !enabled);
  if (!enabled) closeHelpPopover();
}

export function setContextualHelpEnabled(enabled, root = document){
  const safeEnabled = !!enabled;
  writeStorageValue(safeEnabled);
  applyContextualHelpPreference(safeEnabled, root);
  return safeEnabled;
}

function ensurePopover(){
  if (activePopover) return activePopover;

  const popover = document.createElement("div");
  popover.className = "help-popover hidden";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "false");
  popover.innerHTML = `
    <div class="help-popover-arrow" aria-hidden="true"></div>
    <div class="help-popover-card">
      <div class="help-popover-title"></div>
      <div class="help-popover-body"></div>
    </div>
  `;
  document.body.appendChild(popover);
  activePopover = popover;
  return popover;
}

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeHelpContent(trigger, registry){
  const id = String(trigger?.dataset?.helpId || "").trim();
  const registered = id ? registry?.[id] : null;
  const title = trigger?.dataset?.helpTitle || registered?.title || "Aide";
  const bodyHtml = trigger?.dataset?.helpHtml || registered?.bodyHtml || null;
  const body = trigger?.dataset?.helpText || registered?.body || "";

  if (!bodyHtml && !body) return null;

  return {
    title,
    bodyHtml: bodyHtml || `<p>${escapeHtml(body).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`
  };
}

function positionPopover(trigger, popover){
  const rect = trigger.getBoundingClientRect();
  const margin = 14;
  const viewportPadding = 12;
  const maxWidth = Math.min(340, window.innerWidth - viewportPadding * 2);
  popover.style.maxWidth = `${maxWidth}px`;

  popover.classList.remove("hidden", "is-above", "is-below");
  popover.style.left = "0px";
  popover.style.top = "0px";

  const size = popover.getBoundingClientRect();
  const preferAbove = rect.top > size.height + margin + viewportPadding;
  const top = preferAbove
    ? rect.top - size.height - margin
    : rect.bottom + margin;

  let left = rect.left + rect.width / 2 - size.width / 2;
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - size.width - viewportPadding));

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.classList.toggle("is-above", preferAbove);
  popover.classList.toggle("is-below", !preferAbove);

  const arrow = popover.querySelector(".help-popover-arrow");
  if (arrow) {
    const arrowLeft = rect.left + rect.width / 2 - left;
    arrow.style.left = `${Math.round(arrowLeft)}px`;
  }
}

export function closeHelpPopover(){
  if (!activePopover) return;
  activePopover.classList.add("hidden");
  activeTrigger?.setAttribute("aria-expanded", "false");
  activeTrigger = null;
}

function openHelpPopover(trigger, content){
  const popover = ensurePopover();
  const titleEl = popover.querySelector(".help-popover-title");
  const bodyEl = popover.querySelector(".help-popover-body");

  if (titleEl) titleEl.textContent = content.title;
  if (bodyEl) bodyEl.innerHTML = content.bodyHtml;

  activeTrigger?.setAttribute("aria-expanded", "false");
  activeTrigger = trigger;
  activeTrigger.setAttribute("aria-expanded", "true");

  positionPopover(trigger, popover);
}

function isContextualTrigger(trigger){
  return trigger?.dataset?.helpContextual !== "false";
}

function handleHelpTriggerClick(event){
  const trigger = event.target?.closest?.("[data-help-id]");
  if (!trigger) return;
  if (isContextualTrigger(trigger) && !getContextualHelpEnabled()) return;

  const content = normalizeHelpContent(trigger, activeContentRegistry);
  if (!content) return;

  event.preventDefault();
  event.stopPropagation();

  if (activeTrigger === trigger && activePopover && !activePopover.classList.contains("hidden")) {
    closeHelpPopover();
    return;
  }

  openHelpPopover(trigger, content);
}

function handleDocumentPointerDown(event){
  if (!activePopover || activePopover.classList.contains("hidden")) return;
  if (activePopover.contains(event.target) || activeTrigger?.contains(event.target)) return;
  closeHelpPopover();
}

function handleKeyDown(event){
  if (event.key === "Escape") closeHelpPopover();
}

function repositionActivePopover(){
  if (!activeTrigger || !activePopover || activePopover.classList.contains("hidden")) return;
  positionPopover(activeTrigger, activePopover);
}

export function registerHelpContent(content = {}){
  activeContentRegistry = mergeHelpContent(activeContentRegistry, content);
  return activeContentRegistry;
}

export function initContextualHelpSystem({ root = document, content = null } = {}){
  activeRoot = root || document;
  activeContentRegistry = mergeHelpContent(COMMON_HELP_CONTENT, content || {});
  applyContextualHelpPreference(getContextualHelpEnabled(), activeRoot);

  activeRoot.addEventListener("click", handleHelpTriggerClick);

  if (!listenersBound) {
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", repositionActivePopover);
    window.addEventListener("scroll", repositionActivePopover, true);
    listenersBound = true;
  }

  return {
    close: closeHelpPopover,
    registerContent: registerHelpContent,
    setEnabled: (enabled) => setContextualHelpEnabled(enabled, activeRoot),
    getEnabled: getContextualHelpEnabled
  };
}
