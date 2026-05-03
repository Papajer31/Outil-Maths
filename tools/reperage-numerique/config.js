import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderCheckbox,
  readCheckbox,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  LINE_TYPES,
  QUESTION_TYPES,
  MARKER_POSITIONS
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();

  const cfg = normalizeSettings(settings);
  const questionTypes = new Set(cfg.questionTypes);
  const markerPositions = new Set(cfg.markerPositions);
  const isPicbille = cfg.lineType === LINE_TYPES.PICBILLE;
  const isComplete = cfg.lineType === LINE_TYPES.COMPLETE;

  container.innerHTML = renderToolSettingsStack(
    renderRadioGroup({
      title: "Type de droite",
      id: "rn_lineType",
      value: cfg.lineType,
      options: [
        { value: LINE_TYPES.PICBILLE, label: "Frise Picbille" },
        { value: LINE_TYPES.SIMPLE, label: "Droite simple" },
        { value: LINE_TYPES.COMPLETE, label: "Droite complète" }
      ]
    }),
    `
      <div class="tv-group tv-group-inline rn-question-types">
        <div class="tv-minmax-inline">
          <div class="tv-group-title tv-minmax-title">Type de questions</div>
          <div class="tv-radio-options rn-checkbox-options">
            ${renderCheckbox({
              id: "rn_q_numberToGraduation",
              label: "Nombre → Graduation",
              checked: questionTypes.has(QUESTION_TYPES.NUMBER_TO_GRADUATION)
            })}
            ${renderCheckbox({
              id: "rn_q_graduationToNumber",
              label: "Graduation → Nombre",
              checked: questionTypes.has(QUESTION_TYPES.GRADUATION_TO_NUMBER)
            })}
          </div>
        </div>
      </div>
    `,
    `
      <div class="rn-picbille-settings" id="rn_picbille_settings"${isPicbille ? "" : " hidden"}>
        ${renderRadioGroup({
          title: "Nombre de boites",
          id: "rn_picbilleBoxCount",
          value: String(cfg.picbilleBoxCount),
          options: [2, 3, 4, 5, 6].map((count) => ({
            value: String(count),
            label: String(count)
          }))
        })}
      </div>
    `,
    `
      <div class="rn-graduated-settings" id="rn_graduated_settings"${isPicbille ? " hidden" : ""}>
        <div class="tv-group tv-group-inline rn-marker-positions">
          <div class="tv-minmax-inline">
            <div class="tv-group-title tv-minmax-title">Position des repères</div>
            <div class="tv-radio-options rn-checkbox-options">
              ${renderCheckbox({
                id: "rn_pos_start",
                label: "Début",
                checked: markerPositions.has(MARKER_POSITIONS.START)
              })}
              ${renderCheckbox({
                id: "rn_pos_middle",
                label: "Milieu",
                checked: markerPositions.has(MARKER_POSITIONS.MIDDLE)
              })}
              ${renderCheckbox({
                id: "rn_pos_end",
                label: "Fin",
                checked: markerPositions.has(MARKER_POSITIONS.END)
              })}
            </div>
          </div>
        </div>

        ${renderMinMax({
          idPrefix: "rn_markers",
          title: "Plage des repères",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.markerMin,
          maxValue: cfg.markerMax,
          inputMin: 0,
          inputMax: 999,
          step: 1,
          mode: cfg.markerValueMode,
          startValue: cfg.markerValueStart,
          stepValue: cfg.markerValueStep,
          values: cfg.markerValueList
        })}

        ${renderRadioGroup({
          title: "Écart entre les repères",
          id: "rn_markerGap",
          value: String(cfg.markerGap),
          options: [
            { value: "1", label: "1", disabled: isComplete },
            { value: "10", label: "10" },
            { value: "100", label: "100" }
          ]
        })}
      </div>
    `
  );

  bindRadio(container, "rn_lineType", { onChange: syncConditionalSettings });
  bindRadio(container, "rn_markerGap");
  bindRadio(container, "rn_picbilleBoxCount");
  bindMinMax(container, "rn_markers", {
    inputMin: 0,
    inputMax: 999
  });

  container.querySelectorAll("#rn_q_numberToGraduation, #rn_q_graduationToNumber, #rn_pos_start, #rn_pos_middle, #rn_pos_end")
    .forEach((el) => el.addEventListener("change", syncConditionalSettings));

  syncConditionalSettings();

  function syncConditionalSettings() {
    const lineType = readRadio(container, "rn_lineType", LINE_TYPES.SIMPLE);
    const picbilleSettings = container.querySelector("#rn_picbille_settings");
    const graduatedSettings = container.querySelector("#rn_graduated_settings");
    const isPicbilleNow = lineType === LINE_TYPES.PICBILLE;
    const isCompleteNow = lineType === LINE_TYPES.COMPLETE;

    setConditionalBlockVisible(picbilleSettings, isPicbilleNow);
    setConditionalBlockVisible(graduatedSettings, !isPicbilleNow);

    const gapOne = container.querySelector('input[name="rn_markerGap"][value="1"]');
    const gapTen = container.querySelector('input[name="rn_markerGap"][value="10"]');
    if (gapOne) {
      gapOne.disabled = isCompleteNow;
      gapOne.closest(".tv-radio-row")?.classList.toggle("is-disabled", isCompleteNow);
      if (isCompleteNow && gapOne.checked && gapTen) {
        gapTen.checked = true;
      }
    }
  }
}

function setConditionalBlockVisible(block, visible) {
  if (!block) return;
  block.hidden = !visible;
  block.setAttribute("aria-hidden", visible ? "false" : "true");
}

export function readToolSettings(container, settings = {}) {
  const lineType = readRadio(container, "rn_lineType", LINE_TYPES.SIMPLE);
  const allowNumberToGraduation = readCheckbox(container, "rn_q_numberToGraduation");
  const allowGraduationToNumber = readCheckbox(container, "rn_q_graduationToNumber");

  if (!allowNumberToGraduation && !allowGraduationToNumber) {
    throw new Error("Active au moins un type de questions.");
  }

  const questionTypes = [];
  if (allowNumberToGraduation) questionTypes.push(QUESTION_TYPES.NUMBER_TO_GRADUATION);
  if (allowGraduationToNumber) questionTypes.push(QUESTION_TYPES.GRADUATION_TO_NUMBER);

  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {}),
    lineType,
    questionTypes
  };

  if (lineType === LINE_TYPES.PICBILLE) {
    return normalizeSettings({
      ...base,
      picbilleBoxCount: clampInt(readRadio(container, "rn_picbilleBoxCount", String(base.picbilleBoxCount)), 2, 6)
    });
  }

  const markerPositions = [];
  if (readCheckbox(container, "rn_pos_start")) markerPositions.push(MARKER_POSITIONS.START);
  if (readCheckbox(container, "rn_pos_middle")) markerPositions.push(MARKER_POSITIONS.MIDDLE);
  if (readCheckbox(container, "rn_pos_end")) markerPositions.push(MARKER_POSITIONS.END);

  if (!markerPositions.length) {
    throw new Error("Active au moins une position des repères.");
  }

  const markers = readMinMax(container, "rn_markers", {
    inputMin: 0,
    inputMax: 999,
    errorLabel: "La plage des repères"
  });

  const markerGap = clampInt(readRadio(container, "rn_markerGap", "10"), 1, 100);

  if (lineType === LINE_TYPES.COMPLETE && markerGap === 1) {
    throw new Error("La droite complète ne peut pas utiliser un écart de 1.");
  }

  return normalizeSettings({
    ...base,
    markerPositions,
    markerMin: markers.min,
    markerMax: markers.max,
    markerValueMode: markers.mode,
    markerValueStart: markers.start,
    markerValueStep: markers.step,
    markerValueList: markers.values,
    markerGap
  });
}

export { getDefaultSettings };

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-rn-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rnConfigStyle = href;
  document.head.appendChild(link);
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
