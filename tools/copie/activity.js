import { TIMER_MODES, countCopyWords, normalizeSettings, tokenizeCopyText } from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

const MASKED_TEXT_KEYBOARD_ASSET_URL = new URL("../../shared/ui-assets/clavier.webp", import.meta.url).href;
const COPY_INSTRUCTION = "Recopie ce texte en essayant de le regarder le moins possible.";
const VERIFICATION_INSTRUCTION = "Clique sur le dernier mot que tu as écrit.";
const VERIFICATION_WARNING_THRESHOLD_MS = 20000;
let stylesInjected = false;

export function createActivity(initialContext = {}){
  injectStyles();
  ensureToolInstructionStyles();
  const state = createState(initialContext);

  return {
    mount(container, context = initialContext){
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      state.settings = normalizeSettings(state.latestContext?.settings || state.settings);
      renderShell(state);
    },

    next(container, context = state.latestContext){
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      state.settings = normalizeSettings(state.latestContext?.settings || state.settings);
      if (!state.root) renderShell(state);
      startCopyPhase(state);
    },

    nextQuestion(container, context = state.latestContext){
      return this.next(container, context);
    },

    getQuestionTimeLimitSec(){
      if (state.stage !== "copy") return 0;
      return state.settings.copyTimeMode === TIMER_MODES.LIMITED
        ? state.settings.copyTimeMinutes * 60
        : 0;
    },

    handleQuestionTimeout(container, context = state.latestContext){
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      if (state.stage === "copy") {
        beginVerificationIntro(state);
        return true;
      }
      if (state.stage === "verification") {
        finishVerificationWithoutValidation(state);
        return true;
      }
      return false;
    },

    handleShellManualAction(container, context = state.latestContext){
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;

      if (state.stage === "copy") {
        beginVerificationIntro(state);
        return true;
      }
      if (state.stage === "verification-intro") {
        startVerificationPhase(state);
        return true;
      }
      if (state.stage === "verification" && Number.isInteger(state.selectedWordIndex)) {
        state.validatedWordCount = state.selectedWordIndex + 1;
        finishVerification(state);
        return true;
      }
      return false;
    },

    shouldHideShellRevealAction(){
      return true;
    },

    getHistorySnapshot(stage = "question"){
      return buildHistorySnapshot(state, stage);
    },

    unmount(container){
      teardown(state, container || state.container);
    }
  };
}

function createState(initialContext){
  return {
    container:null,
    latestContext:initialContext,
    settings:normalizeSettings(initialContext?.settings || {}),
    root:null,
    instructionEl:null,
    stageEl:null,
    maskedController:null,
    verificationController:null,
    resizeObserver:null,
    warningInterval:null,
    maskedKeys:{ shiftLeft:false, enter:false },
    maskedVisible:false,
    maskedMetric:{ count:0, durationMs:0, activeStartedAt:null, views:[] },
    selectedWordIndex:null,
    validatedWordCount:null,
    textFontPx:null,
    copyStartedAt:null,
    copyFinishedAt:null,
    verificationStartedAt:null,
    verificationFinishedAt:null
  };
}

function renderShell(state){
  if (!state.container) return;
  state.container.innerHTML = `
    <div class="tool-runtime tool-runtime--copie copy-root" data-copy-root>
      ${renderToolInstruction({ id:"copy_instruction", className:"copy-instruction" })}
      <div class="copy-stage" data-copy-stage></div>
    </div>
  `;
  state.root = state.container.querySelector("[data-copy-root]");
  state.instructionEl = state.root?.querySelector("#copy_instruction") || null;
  state.stageEl = state.root?.querySelector("[data-copy-stage]") || null;
}

function startCopyPhase(state){
  abortBindings(state);
  stopVerificationWarningWatcher(state);
  state.latestContext?.services?.setQuestionCompletionAction?.(false);
  state.stage = "copy";
  state.maskedKeys = { shiftLeft:false, enter:false };
  state.maskedVisible = false;
  state.maskedMetric = { count:0, durationMs:0, activeStartedAt:null, views:[] };
  state.selectedWordIndex = null;
  state.validatedWordCount = null;
  state.textFontPx = null;
  state.copyStartedAt = performance.now();
  state.copyFinishedAt = null;
  state.verificationStartedAt = null;
  state.verificationFinishedAt = null;

  setInstruction(state, COPY_INSTRUCTION);
  renderTextStage(state, { masked:true });
  bindMaskedText(state);
  setRuntimeAction(state, "J’ai terminé", true);
}

function renderTextStage(state, { masked = false, verification = false } = {}){
  if (!state.stageEl) return;
  state.stageEl.className = "copy-stage copy-stage--text";
  state.stageEl.innerHTML = `
    <section class="copy-text-frame" data-copy-text-frame>
      <div class="copy-text-model${verification ? " copy-text-model--verification" : ""}" data-copy-text-model aria-hidden="${masked ? "true" : "false"}">${verification ? renderClickableText(state.settings.text) : renderPlainText(state.settings.text)}</div>
      ${masked ? `
        <div class="copy-masked-cover">
          <div class="copy-masked-keyboard-map" aria-hidden="true">
            <img class="copy-masked-keyboard" src="${escapeHtml(MASKED_TEXT_KEYBOARD_ASSET_URL)}" alt="" draggable="false" decoding="async">
          </div>
          <strong>Maintiens MAJ gauche et ENTRÉE</strong>
          <small data-copy-look-count>Tu as regardé 0 fois.</small>
        </div>
      ` : ""}
    </section>
  `;

  const frame = state.stageEl.querySelector("[data-copy-text-frame]");
  if (masked) frame?.classList.add("is-masked");
  scheduleTextFit(state);
  bindTextResize(state);
}

function bindTextResize(state){
  state.resizeObserver?.disconnect?.();
  state.resizeObserver = null;
  if (typeof ResizeObserver !== "function") return;
  const frame = state.stageEl?.querySelector?.("[data-copy-text-frame]");
  if (!frame) return;
  state.resizeObserver = new ResizeObserver(() => scheduleTextFit(state));
  state.resizeObserver.observe(frame);
}

function scheduleTextFit(state){
  window.requestAnimationFrame(() => fitTextToFrame(state));
}

function fitTextToFrame(state){
  const frame = state.stageEl?.querySelector?.("[data-copy-text-frame]");
  const model = frame?.querySelector?.("[data-copy-text-model]");
  if (!frame || !model) return;

  const maxPx = Math.max(24, Math.min(56, Math.round(Math.min(frame.clientWidth / 17, frame.clientHeight / 8))));
  let low = 14;
  let high = maxPx;
  let best = low;

  for (let i = 0; i < 8; i += 1) {
    const mid = (low + high) / 2;
    model.style.fontSize = `${mid}px`;
    const fits = model.scrollHeight <= model.clientHeight + 1 && model.scrollWidth <= model.clientWidth + 1;
    if (fits) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  state.textFontPx = Math.max(14, Math.floor(best * 10) / 10);
  model.style.fontSize = `${state.textFontPx}px`;
}

function bindMaskedText(state){
  state.maskedController?.abort();
  const controller = new AbortController();
  state.maskedController = controller;
  const { signal } = controller;

  const sync = () => setMaskedTextVisible(state, state.maskedKeys.shiftLeft && state.maskedKeys.enter);
  const keyForEvent = (event) => {
    if (event?.code === "ShiftLeft" || (event?.key === "Shift" && event?.location === 1)) return "shiftLeft";
    if (event?.code === "Enter" || (event?.key === "Enter" && event?.location !== 3)) return "enter";
    return null;
  };

  window.addEventListener("keydown", (event) => {
    if (state.stage !== "copy") return;
    const key = keyForEvent(event);
    if (!key) {
      if (state.maskedVisible) resetMaskedKeys(state);
      return;
    }
    if (key === "enter") {
      event.preventDefault();
      event.stopPropagation();
    }
    state.maskedKeys[key] = true;
    sync();
  }, { signal, capture:true });

  const conceal = () => {
    if (state.stage === "copy") resetMaskedKeys(state);
  };
  window.addEventListener("keyup", conceal, { signal, capture:true });
  document.addEventListener("keyup", conceal, { signal, capture:true });

  const preventExtraction = (event) => {
    if (!state.maskedVisible) return;
    event.preventDefault();
    resetMaskedKeys(state);
  };
  document.addEventListener("copy", preventExtraction, { signal, capture:true });
  document.addEventListener("cut", preventExtraction, { signal, capture:true });
  document.addEventListener("selectstart", preventExtraction, { signal, capture:true });

  window.addEventListener("blur", conceal, { signal });
  window.addEventListener("focus", conceal, { signal });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") conceal();
  }, { signal });
}

function setMaskedTextVisible(state, visible){
  const frame = state.stageEl?.querySelector?.("[data-copy-text-frame]");
  const model = frame?.querySelector?.("[data-copy-text-model]");
  if (!frame || !model) {
    state.maskedVisible = false;
    return;
  }

  if (visible === state.maskedVisible) {
    frame.classList.toggle("is-visible", visible);
    model.setAttribute("aria-hidden", visible ? "false" : "true");
    return;
  }

  const now = performance.now();
  state.maskedVisible = visible;
  if (visible) {
    state.maskedMetric.count += 1;
    state.maskedMetric.activeStartedAt = now;
    frame.classList.add("is-visible");
    model.setAttribute("aria-hidden", "false");
    return;
  }

  frame.classList.remove("is-visible");
  model.setAttribute("aria-hidden", "true");
  if (Number.isFinite(state.maskedMetric.activeStartedAt)) {
    const duration = Math.max(0, now - state.maskedMetric.activeStartedAt);
    state.maskedMetric.durationMs += duration;
    state.maskedMetric.views.push(Math.round(duration));
    state.maskedMetric.activeStartedAt = null;
  }
  updateLookCount(state);
}

function resetMaskedKeys(state){
  state.maskedKeys.shiftLeft = false;
  state.maskedKeys.enter = false;
  setMaskedTextVisible(state, false);
}

function updateLookCount(state){
  const node = state.stageEl?.querySelector?.("[data-copy-look-count]");
  if (!node) return;
  const count = Math.max(0, Math.trunc(Number(state.maskedMetric.count) || 0));
  node.textContent = `Tu as regardé ${count} fois.`;
}

function beginVerificationIntro(state){
  if (state.stage !== "copy") return;
  resetMaskedKeys(state);
  state.maskedController?.abort();
  state.maskedController = null;
  state.copyFinishedAt = performance.now();
  state.stage = "verification-intro";
  setInstruction(state, "");

  if (state.stageEl) {
    state.stageEl.className = "copy-stage copy-stage--intro";
    state.stageEl.innerHTML = `
      <h2>Tu vas maintenant vérifier ta copie.</h2>
      <p>Colle le petit tableau sous ton texte.</p>
      <p>Quand tu es prêt, appuie sur le bouton.</p>
    `;
  }

  restartCommonTimer(state, 0);
  setRuntimeAction(state, "Je suis prêt", true);
}

function startVerificationPhase(state){
  if (state.stage !== "verification-intro") return;
  state.stage = "verification";
  state.selectedWordIndex = null;
  state.validatedWordCount = null;
  state.verificationStartedAt = performance.now();

  setInstruction(state, VERIFICATION_INSTRUCTION);
  renderTextStage(state, { verification:true });
  bindVerificationWords(state);
  setRuntimeAction(state, "Valider", false);

  const seconds = state.settings.verificationTimeMode === TIMER_MODES.LIMITED
    ? state.settings.verificationTimeMinutes * 60
    : 0;
  restartCommonTimer(state, seconds);
  startVerificationWarningWatcher(state);
}

function bindVerificationWords(state){
  state.verificationController?.abort();
  const controller = new AbortController();
  state.verificationController = controller;
  const { signal } = controller;

  state.stageEl?.querySelector("[data-copy-text-model]")?.addEventListener("click", (event) => {
    const word = event.target?.closest?.("[data-copy-word-index]");
    if (!word || state.stage !== "verification") return;
    const index = Number(word.dataset.copyWordIndex);
    if (!Number.isInteger(index) || index < 0) return;
    state.selectedWordIndex = state.selectedWordIndex === index ? null : index;
    syncVerificationSelection(state);
  }, { signal });
}

function syncVerificationSelection(state){
  state.stageEl?.querySelectorAll?.("[data-copy-word-index]").forEach((word) => {
    const selected = Number(word.dataset.copyWordIndex) === state.selectedWordIndex;
    word.classList.toggle("is-selected", selected);
    word.setAttribute("aria-pressed", selected ? "true" : "false");
  });

  const hasSelection = Number.isInteger(state.selectedWordIndex);
  setRuntimeAction(state, "Valider", hasSelection);
  state.instructionEl?.classList.toggle("copy-instruction--answered", hasSelection);
  if (!hasSelection) updateVerificationWarning(state);
  else state.instructionEl?.classList.remove("is-urgent");
}

function startVerificationWarningWatcher(state){
  stopVerificationWarningWatcher(state);
  if (state.settings.verificationTimeMode !== TIMER_MODES.LIMITED) return;
  state.warningInterval = window.setInterval(() => updateVerificationWarning(state), 250);
  updateVerificationWarning(state);
}

function stopVerificationWarningWatcher(state){
  if (state.warningInterval) window.clearInterval(state.warningInterval);
  state.warningInterval = null;
}

function updateVerificationWarning(state){
  if (state.stage !== "verification" || !state.instructionEl) return;
  if (Number.isInteger(state.selectedWordIndex)) {
    state.instructionEl.classList.remove("is-urgent");
    return;
  }
  const remainingMs = state.latestContext?.services?.getQuestionRemainingMs?.();
  const urgent = Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= VERIFICATION_WARNING_THRESHOLD_MS;
  state.instructionEl.classList.toggle("is-urgent", urgent);
}

function finishVerificationWithoutValidation(state){
  if (state.stage !== "verification") return;
  state.validatedWordCount = null;
  finishVerification(state);
}

function finishVerification(state){
  if (state.stage !== "verification") return;
  stopVerificationWarningWatcher(state);
  state.verificationController?.abort();
  state.verificationController = null;
  state.verificationFinishedAt = performance.now();
  state.stage = "summary";
  restartCommonTimer(state, 0);
  clearRuntimeAction(state);
  renderSummary(state);
  state.latestContext?.services?.setQuestionCompletionAction?.(true);
}

function renderSummary(state){
  setInstruction(state, "");
  const seconds = getVisibleSeconds(state);
  const wordValue = Number.isInteger(state.validatedWordCount)
    ? `<strong>${state.validatedWordCount}</strong>`
    : `<span class="copy-summary-missing" role="img" aria-label="Valeur manquante">×</span>`;

  if (!state.stageEl) return;
  state.stageEl.className = "copy-stage copy-stage--summary";
  state.stageEl.innerHTML = `
    <div class="copy-summary-card">
      <h2>Reporte ces valeurs dans ton tableau.</h2>
      <div class="copy-summary-grid">
        <div class="copy-summary-label">Regards pour copier :</div><div class="copy-summary-value"><strong>${state.maskedMetric.count}</strong></div>
        <div class="copy-summary-label">Temps d’affichage :</div><div class="copy-summary-value"><strong>${seconds} s</strong></div>
        <div class="copy-summary-label">Mots écrits :</div><div class="copy-summary-value">${wordValue}</div>
      </div>
    </div>
  `;
}

function setInstruction(state, text){
  if (!state.instructionEl) return;
  state.instructionEl.classList.remove("copy-instruction--answered", "is-urgent");
  setToolInstructionText(state.instructionEl, text);
}

function setRuntimeAction(state, label, enabled = true){
  state.latestContext?.services?.setRuntimeManualAction?.({ label, enabled });
}

function clearRuntimeAction(state){
  state.latestContext?.services?.setRuntimeManualAction?.(null);
}

function restartCommonTimer(state, durationSec){
  state.latestContext?.services?.restartQuestionTimer?.(durationSec);
}

function buildHistorySnapshot(state, stage){
  const safeStage = String(stage || "question").toLowerCase();
  const totalWords = countCopyWords(state.settings.text);
  const visibleDurationMs = getVisibleDurationMs(state);
  const visibleSeconds = getVisibleSeconds(state);
  const written = Number.isInteger(state.validatedWordCount) ? state.validatedWordCount : null;

  if (safeStage === "question") {
    return {
      schemaVersion:2,
      kind:"copy-session",
      prompt:String(state.settings.text || "").trim().slice(0, 6000),
      meta:`Texte de copie · ${totalWords} mot${totalWords > 1 ? "s" : ""}`,
      totalWordCount:totalWords
    };
  }

  return {
    schemaVersion:2,
    kind:"copy-session",
    meta:state.stage === "summary" ? "Bilan de copie" : "Copie interrompue avant le bilan",
    facts:[
      { label:"Regards pour copier", value:String(Math.max(0, state.maskedMetric.count)) },
      { label:"Temps d’affichage", value:`${visibleSeconds} s` },
      { label:"Mots écrits", value:written == null ? "✕" : String(written) },
      { label:"Mots dans le texte", value:String(totalWords) }
    ],
    copyLookCount:Math.max(0, state.maskedMetric.count),
    copyVisibleDurationMs:visibleDurationMs,
    copyViewDurationsMs:state.maskedMetric.views.map((value) => Math.max(0, Math.round(Number(value) || 0))),
    writtenWordCount:written,
    totalWordCount:totalWords,
    verificationCompleted:written != null
  };
}

function getVisibleDurationMs(state){
  let duration = Math.max(0, Number(state.maskedMetric.durationMs) || 0);
  if (Number.isFinite(state.maskedMetric.activeStartedAt)) {
    duration += Math.max(0, performance.now() - state.maskedMetric.activeStartedAt);
  }
  return Math.max(0, Math.round(duration));
}

function getVisibleSeconds(state){
  return Math.max(0, Math.round(getVisibleDurationMs(state) / 1000));
}

function renderClickableText(text){
  return tokenizeCopyText(text).map((token) => {
    if (token.kind !== "word") return escapeHtml(token.text);
    return `<span class="copy-word" role="button" tabindex="0" data-copy-word-index="${token.index}" aria-pressed="false">${escapeHtml(token.text)}</span>`;
  }).join("");
}

function renderPlainText(text){
  return escapeHtml(text);
}

function abortBindings(state){
  state.maskedController?.abort();
  state.maskedController = null;
  state.verificationController?.abort();
  state.verificationController = null;
  state.resizeObserver?.disconnect?.();
  state.resizeObserver = null;
}

function teardown(state, container){
  resetMaskedKeys(state);
  abortBindings(state);
  stopVerificationWarningWatcher(state);
  clearRuntimeAction(state);
  state.latestContext?.services?.setQuestionCompletionAction?.(false);
  if (container) container.innerHTML = "";
  state.root = null;
  state.instructionEl = null;
  state.stageEl = null;
  state.stage = "idle";
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function injectStyles(){
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-copy-activity-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.copyActivityStyle = href;
  document.head.appendChild(link);
}
