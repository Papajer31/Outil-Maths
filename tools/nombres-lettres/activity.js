import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  evaluateAnswer,
  QUESTION_DIRECTIONS,
  LETTER_STYLES
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import {
  createNumericAnswerControl,
  renderNumericAnswerDisplayMarkup
} from "../../shared/tool-ui/numeric-answer.js";
import {
  bindNumericKeypadEvents,
  renderNumericKeypad
} from "../../shared/tool-ui/numeric-keypad.js";

let stylesInjected = false;
const NUMERIC_KEY_DATA_ATTRIBUTE = "data-nl-numeric-key";

export function createActivity(initialContext = {}) {
  injectStyles();

  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      renderShell(state);
      syncValidateState(state);
    },

    next(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      if (!state.container) return;

      syncRuntimeState(state, state.latestContext);
      if (!state.root) {
        renderShell(state);
      }

      loadNextQuestion(state, state.latestContext ?? {});
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      updateInstructionDisplay(state);
      revealAnswer(state);
    },

    getShellAnswerDisplayState(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      return getShellAnswerDisplayState(state);
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction") {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      return applyShellAnswerDisplayMode(state, mode);
    },

    supportsShellValidation(context = state.latestContext) {
      return shouldShowResponseBox(context);
    },

    canValidate() {
      return !state.answerRevealed && canSubmitAnswer(state);
    },

    validate() {
      if (!canSubmitAnswer(state) || state.answerRevealed) return false;
      requestReveal(state);
      return true;
    },

    unmount(container) {
      teardownState(state, container || state.container);
    }
  };
}

function createRuntimeState(initialContext = {}) {
  return {
    container: null,
    latestContext: initialContext,
    root: null,
    instructionEl: null,
    stageEl: null,
    stageSourceEl: null,
    stageArrowEl: null,
    stageAnswerEl: null,
    responseShellEl: null,
    responseInputEl: null,
    answerControl: null,
    keypadAbortController: null,
    responseResizeObserver: null,
    currentQuestion: null,
    lastQuestionKey: null,
    answerRevealed: false,
    submittedAnswer: "",
    answerDisplayMode: "correction",
    currentSettings: normalizeSettings(initialContext?.settings),
    showResponseBox: shouldShowResponseBox(initialContext)
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.currentSettings = normalizeSettings(context?.settings || state.currentSettings || {});
  state.showResponseBox = shouldShowResponseBox(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  teardownResponseBindings(state);
  destroyAnswerControl(state);
  syncRuntimeState(state);

  container.innerHTML = `
    <div class="tool-runtime tool-runtime--nombres-lettres nl-root${state.showResponseBox ? " nl-root--boxed" : " nl-root--free"}">
      ${renderToolInstruction({ id: "nl_instruction" })}
      <div class="tool-stage nl-stage" id="nl_stage">
        <div class="tool-source-zone nl-stage-source" id="nl_stage_source"></div>
        <div class="nl-stage-arrow" id="nl_stage_arrow" aria-hidden="true">→</div>
        <div class="tool-answer-zone nl-stage-answer" id="nl_stage_answer"></div>
      </div>
      ${state.showResponseBox ? `<div class="tool-answer-panel nl-response-shell" id="nl_response_shell"></div>` : ""}
    </div>
  `;

  state.root = container.querySelector(".nl-root");
  state.instructionEl = container.querySelector("#nl_instruction");
  state.stageEl = container.querySelector("#nl_stage");
  state.stageSourceEl = container.querySelector("#nl_stage_source");
  state.stageArrowEl = container.querySelector("#nl_stage_arrow");
  state.stageAnswerEl = container.querySelector("#nl_stage_answer");
  state.responseShellEl = container.querySelector("#nl_response_shell");
  state.responseInputEl = null;

  updateInstructionDisplay(state);
  updateLayoutVisibility(state);
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);

  const nextQuestion = pickQuestion(state.currentSettings, {
    avoidKey: state.lastQuestionKey
  });
  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.answerRevealed = false;
  state.submittedAnswer = "";
  state.answerDisplayMode = "correction";

  if (state.showResponseBox !== Boolean(state.responseShellEl)) {
    renderShell(state);
  }

  renderQuestion(state);
  syncValidateState(state);
  focusPrimaryInput(state);
}

function renderQuestion(state) {
  if (!state.currentQuestion) return;

  teardownResponseBindings(state);
  destroyAnswerControl(state);
  updateInstructionDisplay(state);
  updateLayoutVisibility(state);

  state.root?.classList.remove("nl-root--correct", "nl-root--incorrect", "nl-root--revealed");
  state.stageAnswerEl?.classList.remove("is-filled");

  if (state.stageSourceEl) {
    state.stageSourceEl.innerHTML = renderSourceMarkup(
      state.currentQuestion,
      state.currentSettings.letterStyle
    );
  }

  if (state.showResponseBox) {
    if (state.responseShellEl) {
      state.responseShellEl.className = "tool-answer-panel nl-response-shell";
      state.responseShellEl.innerHTML = renderResponseMarkup(
        state.currentQuestion,
        state.currentSettings.letterStyle
      );

      if (state.currentQuestion.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
        mountNumericResponse(state);
      } else {
        state.responseInputEl = state.responseShellEl.querySelector("[data-nl-response-input]");
        bindTextResponseEvents(state);
      }
    }

    if (state.stageAnswerEl) {
      state.stageAnswerEl.innerHTML = "";
    }
  } else {
    state.responseInputEl = null;
    if (state.stageAnswerEl) {
      state.stageAnswerEl.innerHTML = renderFreePlaceholderMarkup(
        state.currentQuestion,
        state.currentSettings.letterStyle
      );
      state.stageAnswerEl.classList.remove("is-filled");
    }
  }
}

function mountNumericResponse(state) {
  if (!state.responseShellEl || !state.currentQuestion) return;

  const host = state.responseShellEl.querySelector("#nl_numeric_answer_host");
  if (!host) return;

  state.answerControl = createNumericAnswerControl({
    id: "nl_response_input",
    className: "nl-number-answer",
    ariaLabel: "Réponse en chiffres",
    maxLength: String(state.currentQuestion.expectedAnswer || "").length || 3,
    captureRoot: state.root,
    onInput: () => {
      if (state.answerRevealed) return;
      syncValidateState(state);
    },
    onSubmit: () => {
      if (!state.answerRevealed && canSubmitAnswer(state)) {
        requestReveal(state);
      }
    }
  });

  host.appendChild(state.answerControl.element);
  state.responseInputEl = state.answerControl.input;

  const abortController = new AbortController();
  state.keypadAbortController = abortController;
  bindNumericKeypadEvents({
    root: state.responseShellEl,
    control: state.answerControl,
    signal: abortController.signal,
    dataAttribute: NUMERIC_KEY_DATA_ATTRIBUTE
  });
}

function bindTextResponseEvents(state) {
  const input = state.responseInputEl;
  if (!input) return;

  input.addEventListener("beforeinput", (event) => {
    if (event.data !== "-") return;
    const start = Number(input.selectionStart) || 0;
    const end = Number(input.selectionEnd) || start;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    if (before.endsWith("-") || after.startsWith("-")) event.preventDefault();
  });

  input.addEventListener("input", () => {
    if (state.answerRevealed) return;
    removeConsecutiveHyphens(input);
    fitTextResponseToPanel(input);
    syncValidateState(state);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (state.answerRevealed) return;
    if (!canSubmitAnswer(state)) return;
    event.preventDefault();
    requestReveal(state);
  });

  if (typeof ResizeObserver === "function") {
    state.responseResizeObserver = new ResizeObserver(() => fitTextResponseToPanel(input));
    state.responseResizeObserver.observe(input);
  }
  requestAnimationFrame(() => fitTextResponseToPanel(input));
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;

  state.answerRevealed = true;
  state.submittedAnswer = getCurrentResponseValue(state);
  state.answerDisplayMode = "correction";
  const evaluation = getStoredEvaluation(state);
  const isCorrect = evaluation.isCorrect;

  if (state.showResponseBox) {
    state.root?.classList.toggle("nl-root--correct", isCorrect);
    state.root?.classList.toggle("nl-root--incorrect", !isCorrect);
  } else {
    state.root?.classList.remove("nl-root--correct", "nl-root--incorrect");
  }
  state.root?.classList.add("nl-root--revealed");

  if (state.showResponseBox) {
    renderDisplayedResponse(state);
  } else if (state.stageAnswerEl) {
    state.stageAnswerEl.innerHTML = renderFreeAnswerMarkup(
      state.currentQuestion,
      state.currentSettings.letterStyle
    );
    state.stageAnswerEl.classList.add("is-filled");
  }

  syncValidateState(state);
}

function requestReveal(state) {
  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });

  if (requested === false || !state.latestContext?.services?.requestAnswerPhase) {
    revealAnswer(state);
  }
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function canSubmitAnswer(state) {
  if (!state.showResponseBox || !state.currentQuestion) {
    return false;
  }

  const answer = getCurrentResponseValue(state);
  if (!answer) return false;

  if (state.currentQuestion.answerKind === "number") {
    return /^\d+$/.test(answer);
  }

  return answer.length > 0;
}

function focusPrimaryInput(state) {
  if (!state.showResponseBox) return;

  queueMicrotask(() => {
    if (state.answerControl) {
      state.answerControl.focus?.();
      return;
    }

    const input = state.responseInputEl;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
      input.select?.();
    } catch {
      input.focus?.();
    }
  });
}

function updateInstructionDisplay(state) {
  const text = resolveQuestionInstructionText(
    state.latestContext,
    state.currentQuestion?.prompt || ""
  );
  setToolInstructionText(state.instructionEl, text);
}

function renderSourceMarkup(question, letterStyle) {
  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    if (letterStyle === LETTER_STYLES.SCRIPT) {
      return renderScriptQuestion(question.displayPrimary);
    }
    return renderSeyesDisplayPanel(question.displayPrimary, {
      writingStyle: letterStyle,
      panelClassName: "tool-card tool-card--white nl-source-panel nl-source-panel--words"
    });
  }

  return renderSourceNumber(question.displayPrimary);
}

function renderResponseMarkup(question, letterStyle) {
  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return `
      <div class="nl-number-response-stack">
        <div class="nl-number-answer-host" id="nl_numeric_answer_host"></div>
        ${renderNumberKeypad()}
      </div>
    `;
  }

  return renderSeyesInputPanel({
    inputId: "nl_response_input",
    ariaLabel: "Réponse en lettres",
    writingStyle: letterStyle
  });
}

function renderRevealedResponseMarkup(question, isCorrect, letterStyle) {
  const resultClassName = isCorrect ? "is-correct" : "is-correction";

  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return `
      <div class="nl-number-response-stack nl-number-response-stack--result">
        <div class="nl-number-answer-host">
          ${renderNumericAnswerDisplayMarkup(question.expectedAnswer, {
            className: `nl-number-answer nl-number-answer--readonly ${resultClassName}`,
            ariaLabel: isCorrect ? "Réponse correcte" : "Correction"
          })}
        </div>
        ${renderNumberKeypad({ hidden: true })}
      </div>
    `;
  }

  return renderSeyesDisplayPanel(question.expectedAnswer, {
    writingStyle: letterStyle,
    panelClassName: `tool-answer-box nl-answer-panel ${resultClassName}`
  });
}

function renderStudentResponseMarkup(question, answer, isCorrect, letterStyle) {
  const displayAnswer = String(answer ?? "").trim();
  const resultClassName = isCorrect ? "is-correct" : "is-incorrect";

  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return `
      <div class="nl-number-response-stack nl-number-response-stack--result">
        <div class="nl-number-answer-host">
          ${renderNumericAnswerDisplayMarkup(displayAnswer, {
            className: `nl-number-answer nl-number-answer--readonly ${resultClassName}`,
            ariaLabel: "Réponse de l’élève"
          })}
        </div>
        ${renderNumberKeypad({ hidden: true })}
      </div>
    `;
  }

  return renderSeyesDisplayPanel(displayAnswer, {
    writingStyle: letterStyle,
    panelClassName: `tool-answer-box nl-answer-panel ${resultClassName}`
  });
}

function renderFreePlaceholderMarkup(question, letterStyle) {
  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return renderNumberCard("?", {
      className: "nl-answer-card nl-answer-card--placeholder"
    });
  }

  return renderSeyesDisplayPanel("", {
    empty: true,
    writingStyle: letterStyle,
    panelClassName: "tool-answer-box nl-answer-panel nl-answer-panel--placeholder"
  });
}

function renderFreeAnswerMarkup(question, letterStyle) {
  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return renderNumberCard(question.expectedAnswer, {
      className: "nl-answer-card"
    });
  }

  return renderSeyesDisplayPanel(question.expectedAnswer, {
    writingStyle: letterStyle,
    panelClassName: "tool-answer-box nl-answer-panel"
  });
}

function renderNumberCard(value, { className = "" } = {}) {
  return `
    <div class="tool-card tool-card--white nl-number-card ${className}">
      <div class="nl-number-card-value">${escapeHtml(String(value ?? ""))}</div>
    </div>
  `;
}

function renderSourceNumber(value) {
  return `
    <div class="tool-question nl-source-number">${escapeHtml(String(value ?? ""))}</div>
  `;
}

function renderScriptQuestion(value) {
  return `<div class="tool-question nl-script-question">${escapeHtml(String(value ?? ""))}</div>`;
}

function renderSeyesInputPanel({ inputId, ariaLabel, writingStyle }) {
  if (writingStyle === LETTER_STYLES.SCRIPT) {
    return `
      <label class="tool-answer-box nl-script-answer-box" for="${escapeHtml(inputId)}">
        <input
          class="tool-answer-input nl-script-answer-input"
          id="${escapeHtml(inputId)}"
          data-nl-response-input
          type="text"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          aria-label="${escapeHtml(ariaLabel)}"
        />
      </label>
    `;
  }

  const styleClassName = getWritingStyleClassName(writingStyle);
  return `
    <label class="tool-answer-box nl-seyes-panel nl-seyes-panel--input ${styleClassName}" for="${escapeHtml(inputId)}">
      <input
        class="tool-answer-input nl-seyes-input"
        id="${escapeHtml(inputId)}"
        data-nl-response-input
        type="text"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        aria-label="${escapeHtml(ariaLabel)}"
      />
    </label>
  `;
}

function renderSeyesDisplayPanel(text, {
  empty = false,
  panelClassName = "",
  writingStyle = LETTER_STYLES.CURSIVE
} = {}) {
  const safeText = String(text ?? "").trim();
  if (writingStyle === LETTER_STYLES.SCRIPT) {
    return `
      <div class="tool-answer-box nl-script-answer-box nl-script-answer-display ${panelClassName}${empty ? " is-empty" : ""}">
        ${empty ? "" : escapeHtml(safeText)}
      </div>
    `;
  }
  const styleClassName = getWritingStyleClassName(writingStyle);
  return `
    <div class="nl-seyes-panel ${styleClassName} ${panelClassName}${empty ? " is-empty" : ""}">
      <div class="nl-seyes-text">${empty ? "" : escapeHtml(safeText)}</div>
    </div>
  `;
}

function renderNumberKeypad({ hidden = false } = {}) {
  return renderNumericKeypad({
    hidden,
    rootClassName: "nl-number-keypad",
    buttonClassName: "nl-number-keypad-button",
    clearButtonClassName: "nl-number-keypad-button--clear",
    dataAttribute: NUMERIC_KEY_DATA_ATTRIBUTE,
    ariaLabel: "Clavier numérique"
  });
}

function getWritingStyleClassName(value) {
  return value === LETTER_STYLES.SCRIPT
    ? "nl-seyes-panel--script"
    : "nl-seyes-panel--cursive";
}

function normalizeAnswerDisplayMode(value) {
  return String(value ?? "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function getCurrentResponseValue(state) {
  if (state.answerControl) {
    return String(state.answerControl.getValue?.() ?? "").trim();
  }
  return String(state.responseInputEl?.value ?? "").trim();
}

function removeConsecutiveHyphens(input) {
  const source = String(input?.value ?? "");
  const normalized = source.replace(/-{2,}/g, "-");
  if (normalized === source) return;

  const cursor = Number(input.selectionStart) || source.length;
  const normalizedCursor = source.slice(0, cursor).replace(/-{2,}/g, "-").length;
  input.value = normalized;
  input.setSelectionRange?.(normalizedCursor, normalizedCursor);
}

function fitTextResponseToPanel(input) {
  const panel = input?.closest?.(".nl-seyes-panel");
  if (!panel) {
    fitScriptTextResponse(input);
    return;
  }

  ["--nl-seyes-step", "--nl-seyes-substep", "--nl-seyes-font-size", "--nl-seyes-text-top"].forEach((property) => panel.style.removeProperty(property));
  const text = String(input.value || "");
  if (!text || !input.clientWidth) return;

  const panelStyle = getComputedStyle(panel);
  const computed = getComputedStyle(input);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  context.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  const textWidth = context.measureText(text).width;
  const availableWidth = Math.max(1, input.clientWidth - 2);
  const scale = Math.max(.42, Math.min(1, availableWidth / Math.max(1, textWidth)));
  const scaleMetric = (name) => {
    const base = Number.parseFloat(panelStyle.getPropertyValue(name));
    return Number.isFinite(base) ? `${base * scale}px` : "";
  };
  panel.style.setProperty("--nl-seyes-step", scaleMetric("--nl-seyes-base-step"));
  panel.style.setProperty("--nl-seyes-substep", scaleMetric("--nl-seyes-base-substep"));
  panel.style.setProperty("--nl-seyes-font-size", scaleMetric("--nl-seyes-base-font-size"));
  panel.style.setProperty("--nl-seyes-text-top", scaleMetric("--nl-seyes-base-text-top"));
}

function fitScriptTextResponse(input) {
  if (!input?.classList?.contains("nl-script-answer-input")) return;
  fitScriptTextElement(input, input.value);
}

function fitScriptTextElement(element, value = element?.textContent) {
  if (!element) return;
  element.style.removeProperty("font-size");
  const text = String(value || "");
  if (!text || !element.clientWidth) return;

  const computed = getComputedStyle(element);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  context.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  const horizontalPadding = Number.parseFloat(computed.paddingLeft) + Number.parseFloat(computed.paddingRight);
  const availableWidth = Math.max(1, element.clientWidth - horizontalPadding - 2);
  const scale = Math.max(.5, Math.min(1, availableWidth / Math.max(1, context.measureText(text).width)));
  element.style.fontSize = `${Number.parseFloat(computed.fontSize) * scale}px`;
}

function getStoredEvaluation(state) {
  return evaluateAnswer(state.currentQuestion, state.submittedAnswer ?? "");
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.showResponseBox || !state.answerRevealed || !state.currentQuestion) {
    return false;
  }

  const submittedAnswer = String(state.submittedAnswer ?? "").trim();
  if (!submittedAnswer) {
    return false;
  }

  return submittedAnswer !== String(state.currentQuestion.expectedAnswer ?? "").trim();
}

function renderDisplayedResponse(state) {
  if (!state.responseShellEl || !state.currentQuestion) return;

  teardownResponseBindings(state);
  destroyAnswerControl(state);

  const evaluation = getStoredEvaluation(state);
  const isCorrect = evaluation.isCorrect;
  const showStudentAnswer = canToggleStudentAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";

  state.responseShellEl.className = "tool-answer-panel nl-response-shell";
  state.responseShellEl.innerHTML = showStudentAnswer
    ? renderStudentResponseMarkup(
      state.currentQuestion,
      state.submittedAnswer,
      isCorrect,
      state.currentSettings.letterStyle
    )
    : renderRevealedResponseMarkup(
      state.currentQuestion,
      isCorrect,
      state.currentSettings.letterStyle
    );
  state.responseShellEl.querySelectorAll(".nl-script-answer-display").forEach((element) => fitScriptTextElement(element));
  state.responseInputEl = null;
}

function getShellAnswerDisplayState(state) {
  return {
    canToggle: canToggleStudentAnswerDisplay(state),
    mode: canToggleStudentAnswerDisplay(state)
      ? normalizeAnswerDisplayMode(state.answerDisplayMode)
      : "correction",
    transitionTargets: [state.responseShellEl]
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!state.showResponseBox || !state.answerRevealed || !state.responseShellEl) {
    return false;
  }

  if (!canToggleStudentAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    renderDisplayedResponse(state);
    return false;
  }

  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  renderDisplayedResponse(state);
  return true;
}

function getCurrentEvaluation(state) {
  return evaluateAnswer(state.currentQuestion, getCurrentResponseValue(state));
}

function isCurrentAnswerCorrect(state) {
  if (!state.showResponseBox || !state.currentQuestion) {
    return false;
  }
  return getCurrentEvaluation(state).isCorrect;
}

function updateLayoutVisibility(state) {
  const freeMode = !state.showResponseBox;
  state.root?.classList.toggle("nl-root--free", freeMode);
  state.root?.classList.toggle("nl-root--boxed", !freeMode);
  state.stageEl?.classList.toggle("nl-stage--free", freeMode);
  state.stageEl?.classList.toggle("nl-stage--boxed", !freeMode);

  if (state.stageArrowEl) {
    state.stageArrowEl.hidden = !freeMode;
  }

  if (state.stageAnswerEl) {
    state.stageAnswerEl.hidden = !freeMode;
  }
}

function shouldShowResponseBox(context = {}) {
  return getResponseUi(context) === "boxed";
}

function getResponseUi(context = {}) {
  return normalizeResponseUi(
    context?.responseUi
    ?? context?.response_ui
    ?? context?.passationProfile?.responseUi
    ?? context?.passationProfile?.response_ui
  ) || "boxed";
}

function normalizeResponseUi(value) {
  const safeValue = String(value ?? "").trim().toLowerCase();
  if (safeValue === "boxed" || safeValue === "free") return safeValue;
  return "";
}

function teardownResponseBindings(state) {
  state.keypadAbortController?.abort?.();
  state.keypadAbortController = null;
  state.responseResizeObserver?.disconnect?.();
  state.responseResizeObserver = null;
}

function destroyAnswerControl(state) {
  state.answerControl?.destroy?.();
  state.answerControl = null;
}

function teardownState(state, container) {
  teardownResponseBindings(state);
  destroyAnswerControl(state);

  if (container) {
    container.innerHTML = "";
  }
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.stageEl = null;
  state.stageSourceEl = null;
  state.stageArrowEl = null;
  state.stageAnswerEl = null;
  state.responseShellEl = null;
  state.responseInputEl = null;
  state.currentQuestion = null;
  state.lastQuestionKey = null;
  state.answerRevealed = false;
  state.submittedAnswer = "";
  state.answerDisplayMode = "correction";
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-nl-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.nlActivityStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
