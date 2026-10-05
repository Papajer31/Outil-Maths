import {
  bindStepperField,
  readStepper,
  renderStepperField,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import { TIMER_MODES, getDefaultSettings, normalizeSettings } from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings = {}){
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="copy-config-root">
      ${renderToolSettingsStack(
        `
          <div class="copy-config-timers-row">
            <div class="tv-group tv-group-inline copy-config-timer-widget">
              ${renderStepperField({
                id:"copy_copyTimeMinutes",
                label:"Temps de copie",
                value:cfg.copyTimeMinutes,
                inputMin:1,
                inputMax:60,
                fieldClassName:"tv-stepper-field-inline",
                actionButtonHtml:renderInfiniteToggleButton({
                  id:"copy_copyTimeInfinite",
                  label:"Temps de copie illimité",
                  active:cfg.copyTimeMode === TIMER_MODES.UNLIMITED
                })
              })}
            </div>

            <div class="tv-group tv-group-inline copy-config-timer-widget">
              ${renderStepperField({
                id:"copy_verificationTimeMinutes",
                label:"Temps de vérification",
                value:cfg.verificationTimeMinutes,
                inputMin:1,
                inputMax:30,
                fieldClassName:"tv-stepper-field-inline",
                actionButtonHtml:renderInfiniteToggleButton({
                  id:"copy_verificationTimeInfinite",
                  label:"Temps de vérification illimité",
                  active:cfg.verificationTimeMode === TIMER_MODES.UNLIMITED
                })
              })}
            </div>
          </div>

          <section class="tv-group copy-config-text-group">
            <div class="tv-group-title">Texte à copier</div>
            <textarea id="copy_text" class="tv-input tv-minmax-textarea copy-config-textarea" rows="9" maxlength="12000" spellcheck="true" placeholder="Saisis le texte que les élèves devront copier…">${escapeHtml(cfg.text)}</textarea>
            <div class="copy-config-text-meta"><span data-copy-word-count>${countWordsForLabel(cfg.text)}</span></div>
          </section>
        `
      )}
    </div>
  `;

  const text = container.querySelector("#copy_text");
  text?.addEventListener("input", () => updateWordCount(container));

  bindStepperField(container, "copy_copyTimeMinutes", { inputMin:1, inputMax:60 });
  bindStepperField(container, "copy_verificationTimeMinutes", { inputMin:1, inputMax:30 });

  bindInfiniteToggle(container, {
    buttonId:"copy_copyTimeInfinite",
    inputId:"copy_copyTimeMinutes"
  });
  bindInfiniteToggle(container, {
    buttonId:"copy_verificationTimeInfinite",
    inputId:"copy_verificationTimeMinutes"
  });
}

export function readToolSettings(container, settings = {}){
  const previous = normalizeSettings(settings);
  const text = String(container.querySelector("#copy_text")?.value ?? previous.text).replace(/\r\n?/g, "\n");
  if (!text.trim()) throw new Error("Saisis le texte à copier.");

  return normalizeSettings({
    ...previous,
    text,
    copyTimeMode:isInfiniteToggleActive(container, "copy_copyTimeInfinite")
      ? TIMER_MODES.UNLIMITED
      : TIMER_MODES.LIMITED,
    copyTimeMinutes:readStepper(container, "copy_copyTimeMinutes", { inputMin:1, inputMax:60 }),
    verificationTimeMode:isInfiniteToggleActive(container, "copy_verificationTimeInfinite")
      ? TIMER_MODES.UNLIMITED
      : TIMER_MODES.LIMITED,
    verificationTimeMinutes:readStepper(container, "copy_verificationTimeMinutes", { inputMin:1, inputMax:30 })
  });
}

export { getDefaultSettings };

function renderInfiniteToggleButton({ id, label, active = false }){
  return `
    <button
      class="tv-stepper-infinity-btn${active ? " is-active" : ""}"
      type="button"
      id="${escapeHtml(id)}"
      data-infinite-toggle="true"
      aria-label="${escapeHtml(label)}"
      aria-pressed="${active ? "true" : "false"}"
      title="${escapeHtml(label)}"
    >
      <span class="tv-stepper-icon" aria-hidden="true">all_inclusive</span>
    </button>
  `;
}

function bindInfiniteToggle(container, { buttonId, inputId }){
  const button = container.querySelector(`#${cssEscape(buttonId)}`);
  const input = container.querySelector(`#${cssEscape(inputId)}`);
  if (!button || !input) return;

  const applyState = (active) => {
    button.classList.toggle("is-active", !!active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    input.disabled = !!active;
    input.closest(".tv-stepper")?.classList.toggle("is-disabled", !!active);
  };

  applyState(button.getAttribute("aria-pressed") === "true");

  button.addEventListener("click", () => {
    const nextActive = button.getAttribute("aria-pressed") !== "true";
    applyState(nextActive);
    input.dispatchEvent(new Event("change", { bubbles:true }));
  });
}

function isInfiniteToggleActive(container, id){
  return container.querySelector(`#${cssEscape(id)}`)?.getAttribute("aria-pressed") === "true";
}

function updateWordCount(container){
  const text = String(container.querySelector("#copy_text")?.value || "");
  const label = container.querySelector("[data-copy-word-count]");
  if (label) label.textContent = countWordsForLabel(text);
}

function countWordsForLabel(text){
  const count = (String(text || "").match(/[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}]|[’'\-](?=[\p{L}\p{N}]))*/gu) || []).length;
  return `${count} mot${count > 1 ? "s" : ""}`;
}

function cssEscape(value){
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value || ""));
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
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
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-copy-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.copyConfigStyle = href;
  document.head.appendChild(link);
}
