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
          <div class="tv-group pa-config-mode-block" data-pa-mode-block="${MODES.GROUPS}">
            <div class="tv-group-title">Alignements à trouver</div>
            ${renderStepperField({
              id: "pa_groupCount",
              label: "Groupes de 3 points",
              value: cfg.groupCount,
              inputMin: 1,
              inputMax: 2
            })}
          </div>
        `,
        `
          <div class="tv-group pa-config-mode-block" data-pa-mode-block="${MODES.WITH_AB}">
            <div class="tv-group-title">Points corrects</div>
            ${renderStepperField({
              id: "pa_alignedCount",
              label: "Points alignés avec A et B",
              value: cfg.alignedCount,
              inputMin: 1,
              inputMax: 5
            })}
          </div>
        `,
        `
          <div class="tv-group tv-group-inline">
            <div class="tv-group-title">Distracteurs</div>
            <div class="pa-config-hint">Dans le mode « groupes de 3 », le minimum est automatiquement de 3 distracteurs par groupe à trouver.</div>
            ${renderStepperField({
              id: "pa_distractorCount",
              label: "Nombre de points",
              value: cfg.distractorCount,
              inputMin: 0,
              inputMax: 12
            })}
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
          title: "Dessin persistant",
          id: "pa_drawingPersistence",
          value: cfg.drawingPersistence,
          options: [
            { value: DRAWING_PERSISTENCE.ALL, label: "Tous les traits" },
            { value: DRAWING_PERSISTENCE.LAST_ONLY, label: "Un seul trait" },
            { value: DRAWING_PERSISTENCE.NONE, label: "Aucun trait" }
          ]
        }),
        `
          <div class="pa-config-help">
            <div><strong>Tous les traits</strong> : tous les tracés restent visibles.</div>
            <div><strong>Un seul trait</strong> : seul le dernier tracé est conservé.</div>
            <div><strong>Aucun trait</strong> : le trait reste provisoire en pointillés et n’est jamais conservé.</div>
          </div>
        `
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
    drawingPersistence: readRadio(container, "pa_drawingPersistence", DRAWING_PERSISTENCE.ALL)
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
  const groupField = container.querySelector('[data-stepper-field="pa_groupCount"] input');
  const distractorField = container.querySelector('[data-stepper-field="pa_distractorCount"] input');
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
