import {
  bindStepperField,
  readRadio,
  readStepper,
  renderRadioGroup,
  renderStepperField,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  DIFFICULTIES,
  DRAWING_PERSISTENCE,
  DRAWING_TYPES,
  MODES,
  getDefaultSettings,
  normalizeSettings
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings = {}) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="pa-config-root" data-pa-config-mode="${escapeAttr(cfg.mode)}">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Type d’exercice",
          id: "pa_mode",
          value: cfg.mode,
          options: [
            { value: MODES.GROUPS, label: "Trouver les groupes de 3 points alignés" },
            { value: MODES.WITH_AB, label: "Points alignés avec A et B" },
            { value: MODES.DOUBLE_ALIGNMENT, label: "Point d’intersection" }
          ]
        }),
        `
          <div class="pa-config-count-widgets">
            <div class="tv-group tv-group-inline pa-config-mode-block" data-pa-mode-block="${MODES.GROUPS}">
              ${renderStepperField({
                id: "pa_groupCount",
                label: "Alignement à trouver",
                value: cfg.groupCount,
                inputMin: 1,
                inputMax: 2,
                fieldClassName: "tv-stepper-field-inline"
              })}
            </div>

            <div class="tv-group tv-group-inline pa-config-mode-block" data-pa-mode-block="${MODES.WITH_AB}">
              ${renderStepperField({
                id: "pa_alignedCount",
                label: "Points corrects",
                value: cfg.alignedCount,
                inputMin: 1,
                inputMax: 5,
                fieldClassName: "tv-stepper-field-inline"
              })}
            </div>

            <div class="tv-group tv-group-inline pa-config-distractors-widget">
              ${renderStepperField({
                id: "pa_distractorCount",
                label: "Distracteurs",
                value: cfg.distractorCount,
                inputMin: 0,
                inputMax: 12,
                fieldClassName: "tv-stepper-field-inline"
              })}
            </div>
          </div>
        `,
        `
          <div class="pa-config-difficulty-block">
            ${renderRadioGroup({
              title: "Niveau d’exigence des distracteurs",
              id: "pa_difficulty",
              value: cfg.difficulty,
              options: [
                { value: DIFFICULTIES.TRIVIAL, label: "Trivial" },
                { value: DIFFICULTIES.MODERATE, label: "Modéré" },
                { value: DIFFICULTIES.DEMANDING, label: "Exigeant" }
              ]
            })}
          </div>
        `,
        renderRadioGroup({
          title: "Tracés",
          id: "pa_drawingType",
          value: cfg.drawingType,
          options: [
            { value: DRAWING_TYPES.SEGMENT, label: "Segment" },
            { value: DRAWING_TYPES.LINE, label: "Droite" }
          ]
        }),
        renderRadioGroup({
          title: "Dessin persistant",
          id: "pa_drawingPersistence",
          value: cfg.drawingPersistence,
          options: [
            { value: DRAWING_PERSISTENCE.ALL, label: "Tous les traits" },
            { value: DRAWING_PERSISTENCE.LAST_ONLY, label: "Un seul trait" },
            { value: DRAWING_PERSISTENCE.NONE, label: "Aucun trait" }
          ]
        })
      )}
    </div>
  `;

  bindStepperField(container, "pa_groupCount", { inputMin: 1, inputMax: 2 });
  bindStepperField(container, "pa_alignedCount", { inputMin: 1, inputMax: 5 });
  bindStepperField(container, "pa_distractorCount", { inputMin: 0, inputMax: 12 });
  bindModeVisibility(container);
  bindGroupsConstraints(container);
}

export function readToolSettings(container, settings = {}) {
  const mode = readRadio(container, "pa_mode", MODES.GROUPS);
  const groupCount = readStepper(container, "pa_groupCount", { inputMin: 1, inputMax: 2 });
  const distractorCount = readStepper(container, "pa_distractorCount", { inputMin: 0, inputMax: 12 });
  return normalizeSettings({
    ...getDefaultSettings(),
    ...(settings ?? {}),
    mode,
    groupCount,
    alignedCount: readStepper(container, "pa_alignedCount", { inputMin: 1, inputMax: 5 }),
    distractorCount: mode === MODES.GROUPS ? Math.max(distractorCount, groupCount * 3) : distractorCount,
    difficulty: readRadio(container, "pa_difficulty", DIFFICULTIES.MODERATE),
    drawingPersistence: readRadio(container, "pa_drawingPersistence", DRAWING_PERSISTENCE.ALL),
    drawingType: readRadio(container, "pa_drawingType", DRAWING_TYPES.SEGMENT)
  });
}

export { getDefaultSettings };

function bindModeVisibility(container) {
  const root = container.querySelector(".pa-config-root");
  if (!root) return;
  const radios = [...container.querySelectorAll('input[name="pa_mode"]')];
  const sync = () => {
    const value = radios.find((input) => input.checked)?.value || MODES.GROUPS;
    root.dataset.paConfigMode = value;
    root.querySelectorAll("[data-pa-mode-block]").forEach((block) => {
      block.hidden = block.dataset.paModeBlock !== value;
    });
    const difficultyBlock = root.querySelector(".pa-config-difficulty-block");
    if (difficultyBlock) difficultyBlock.hidden = value === MODES.GROUPS;
  };
  radios.forEach((input) => input.addEventListener("change", sync));
  sync();
}

function bindGroupsConstraints(container) {
  const modeInputs = [...container.querySelectorAll('input[name="pa_mode"]')];
  const groupField = container.querySelector("#pa_groupCount");
  const distractorField = container.querySelector("#pa_distractorCount");
  if (!groupField || !distractorField) return;

  const sync = () => {
    const mode = modeInputs.find((input) => input.checked)?.value || MODES.GROUPS;
    const groupCount = Math.max(1, Math.min(2, Number.parseInt(groupField.value, 10) || 1));
    const minDistractors = mode === MODES.GROUPS ? groupCount * 3 : 0;
    distractorField.min = String(minDistractors);
    if ((Number.parseInt(distractorField.value, 10) || 0) < minDistractors) {
      distractorField.value = String(minDistractors);
      distractorField.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  modeInputs.forEach((input) => input.addEventListener("change", sync));
  groupField.addEventListener("change", sync);
  sync();
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-pa-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.paConfigStyle = href;
  document.head.appendChild(link);
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
