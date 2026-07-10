import { normalizeFlashSettings, shouldShowFlashAnswersAfterQuestion } from "./model.js";

const FLASH_SECOND_MS = 1000;
let stylesInjected = false;

export function isFlashRuntimeEnabled(context = {}) {
  return context?.flashRuntime?.enabled === true || context?.flash?.enabled === true;
}

export function createFlashRuntimeState(initialContext = {}) {
  return {
    enabled: isFlashRuntimeEnabled(initialContext),
    settings: normalizeFlashSettings(initialContext?.settings),
    sequenceId: 0,
    hideTimer: null,
    replayTimer: null,
    replayUsed: false,
    itemHidden: false,
    answerVisible: true
  };
}

export function syncFlashRuntimeSettings(flashState, settings = {}) {
  if (!flashState?.enabled) return;
  flashState.settings = normalizeFlashSettings(settings);
}

export function clearFlashRuntimeTimers(flashState) {
  if (!flashState) return;
  window.clearTimeout(flashState.hideTimer);
  window.clearTimeout(flashState.replayTimer);
  flashState.hideTimer = null;
  flashState.replayTimer = null;
}

export function resetFlashRuntimeQuestion(flashState) {
  if (!flashState?.enabled) return;
  clearFlashRuntimeTimers(flashState);
  flashState.sequenceId += 1;
  flashState.replayUsed = false;
  flashState.itemHidden = false;
  flashState.answerVisible = !shouldShowFlashAnswersAfterQuestion(flashState.settings);
}

export function getFlashReadyDelayMs(settings = {}) {
  return normalizeFlashSettings(settings).flashPreparationSeconds * FLASH_SECOND_MS;
}

export function shouldDelayFlashAnswers(flashState) {
  return flashState?.enabled === true && shouldShowFlashAnswersAfterQuestion(flashState.settings);
}

export function renderFlashCueMarkup(settings = {}) {
  const pulseCount = normalizeFlashSettings(settings).flashPreparationSeconds;
  return `
    <div class="tool-flash-cue" style="--tool-flash-cue-pulse-count:${pulseCount};" aria-hidden="true">
      <span class="tool-flash-cue-ring"></span>
    </div>
  `;
}

export function renderFlashItemMarkup(innerHtml = "", { replayVisible = false } = {}) {
  return `
    <div class="tool-flash-item-shell">
      <div class="tool-flash-item-content">${innerHtml}</div>
      <button class="btn tool-flash-replay-btn" type="button" data-flash-replay ${replayVisible ? "" : "hidden"}>Revoir l’item</button>
    </div>
  `;
}

export function setFlashAnswerVisible(element, visible) {
  if (!element) return;
  element.classList.toggle("tool-flash-answer-hidden", !visible);
  element.setAttribute("aria-hidden", visible ? "false" : "true");
}

export function setFlashQuestionHidden(questionEl, hidden) {
  const itemContent = questionEl?.querySelector?.(".tool-flash-item-content");
  if (!itemContent) return;
  itemContent.classList.toggle("is-flash-hidden", hidden);
}

export function getFlashReplayButton(questionEl) {
  return questionEl?.querySelector?.("[data-flash-replay]") || null;
}

export function showFlashReplayButton(questionEl, visible) {
  const button = getFlashReplayButton(questionEl);
  if (!button) return;
  button.hidden = !visible;
}

export function ensureFlashRuntimeStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-flash-runtime-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.flashRuntimeStyle = href;
  document.head.appendChild(link);
}

export function wait(ms = 0) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Math.trunc(Number(ms) || 0)));
  });
}
