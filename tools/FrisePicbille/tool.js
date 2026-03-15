import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderSection,
  renderSelect,
  readSelect,
  clampInt
} from "../toolVariables.js";

const DRAW = {
  cellsPerBox: 10,

  cellWidth: 34,
  cellHeight: 44,
  boxGap: 14,

  circleRadius: 58,
  circleTopY: 20,
  stripTopY: 118,

  leftPadding: 24,
  rightPadding: 24,

  stripFill: "#efe1bf",
  stripStroke: "#8b7a63",
  mainLine: "#6f6455",
  crossLine: "#c9b48a",
  circleStroke: "#67b7e8",
  textColor: "#2b2b2b",

  svgHeight: 190
};

let currentTarget = null;
let valuePool = [];
let lastTarget = null;

export default {
  getDefaultSettings(){
    return {
      boxCount: 6,
      minValue: 11,
      maxValue: 60
    };
  },

  renderToolSettings(container, settings){
    const cfg = normalizeSettings(settings);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">

        ${renderSection("Frise", `
          ${renderSelect({
            id: "fp_boxCount",
            label: "Nombre de boites",
            value: cfg.boxCount,
            options: [
              { value: 2, label: "2 boites" },
              { value: 3, label: "3 boites" },
              { value: 4, label: "4 boites" },
              { value: 5, label: "5 boites" },
              { value: 6, label: "6 boites" }
            ]
          })}
        `)}

        ${renderMinMax({
          idPrefix: "fp_values",
          title: "Valeurs cibles",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.minValue,
          maxValue: cfg.maxValue,
          inputMin: 1,
          inputMax: cfg.boxCount * DRAW.cellsPerBox,
          step: 1
        })}

      </div>
    `;

    bindMinMax(container, "fp_values", {
      inputMin: 1,
      inputMax: cfg.boxCount * DRAW.cellsPerBox
    });

    const boxCountEl = container.querySelector("#fp_boxCount");
    const minEl = container.querySelector("#fp_values_min");
    const maxEl = container.querySelector("#fp_values_max");

    const syncSpecific = () => {
      const boxCount = clampInt(boxCountEl?.value, 3, 6);
      const absoluteMax = boxCount * DRAW.cellsPerBox;

      minEl.max = String(absoluteMax);
      maxEl.max = String(absoluteMax);

      minEl.value = String(clampInt(minEl.value, 1, absoluteMax));
      maxEl.value = String(clampInt(maxEl.value, 1, absoluteMax));

      if (Number(minEl.value) > Number(maxEl.value)){
        minEl.value = maxEl.value;
      }
    };

    boxCountEl?.addEventListener("change", syncSpecific);
    minEl?.addEventListener("input", syncSpecific);
    maxEl?.addEventListener("input", syncSpecific);
    minEl?.addEventListener("change", syncSpecific);
    maxEl?.addEventListener("change", syncSpecific);

    syncSpecific();
  },

  readToolSettings(container){
    const boxCount = readSelect(container, "fp_boxCount", {
      parse: (v) => clampInt(v, 3, 6)
    });

    const absoluteMax = boxCount * DRAW.cellsPerBox;

    const values = readMinMax(container, "fp_values", {
      inputMin: 1,
      inputMax: absoluteMax,
      errorLabel: "Les bornes des valeurs cibles"
    });

    return {
      boxCount,
      minValue: values.min,
      maxValue: values.max
    };
  },

  mount(container, ctx) {
    container.innerHTML = `
      <div class="tool-center">
        <div id="picbilleRoot" style="
          width:100%;
          height:100%;
          display:flex;
          align-items:center;
          justify-content:center;
        ">
          <div id="picbilleHost" style="
            width:100%;
            display:flex;
            justify-content:center;
            align-items:center;
          "></div>
        </div>
      </div>
    `;
  },

  nextQuestion(container, ctx) {
    const settings = normalizeSettings(ctx?.settings);

    if (valuePool.length === 0) {
      refillValuePool(settings);
    }

    currentTarget = valuePool.pop();
    lastTarget = currentTarget;

    renderExercise(container, false, settings);
  },

  showAnswer(container, ctx) {
    const settings = normalizeSettings(ctx?.settings);
    renderExercise(container, true, settings);
  },

  unmount(container) {
    container.innerHTML = "";
    currentTarget = null;
    valuePool = [];
    lastTarget = null;
  }
};

function normalizeSettings(settings){
  const base = {
    boxCount: 6,
    minValue: 11,
    maxValue: 60,
    ...(settings ?? {})
  };

  base.boxCount = clampInt(base.boxCount, 3, 6);

  const absoluteMax = base.boxCount * DRAW.cellsPerBox;
  base.minValue = clampInt(base.minValue, 1, absoluteMax);
  base.maxValue = clampInt(base.maxValue, 1, absoluteMax);

  if (base.minValue > base.maxValue){
    const tmp = base.minValue;
    base.minValue = base.maxValue;
    base.maxValue = tmp;
  }

  return base;
}

function renderExercise(container, showAnswer, settings) {
  const host = container.querySelector("#picbilleHost");
  if (!host) return;

  const totalWidth =
    DRAW.leftPadding +
    (settings.boxCount * DRAW.cellsPerBox * DRAW.cellWidth) +
    ((settings.boxCount - 1) * DRAW.boxGap) +
    DRAW.rightPadding;

  const svgWidth = totalWidth;
  const svgHeight = DRAW.svgHeight;

  const targetCenterX = getCellCenterX(currentTarget);
  const circleCx = targetCenterX;
  const circleCy = DRAW.circleTopY;
  const stripTopY = DRAW.stripTopY;

  let boxesSvg = "";
  for (let boxIndex = 0; boxIndex < settings.boxCount; boxIndex++) {
    boxesSvg += renderBox(boxIndex);
  }

  host.innerHTML = `
    <svg
      width="${svgWidth}"
      height="${svgHeight}"
      viewBox="0 0 ${svgWidth} ${svgHeight}"
      aria-hidden="true"
      style="display:block; max-width:100%; height:auto; overflow:visible;"
    >
      <line
        x1="${circleCx}"
        y1="${circleCy + DRAW.circleRadius}"
        x2="${circleCx}"
        y2="${stripTopY}"
        stroke="${DRAW.mainLine}"
        stroke-width="6"
        stroke-linecap="round"
      />

      ${boxesSvg}

      <circle
        cx="${circleCx}"
        cy="${circleCy}"
        r="${DRAW.circleRadius}"
        fill="white"
        stroke="${DRAW.circleStroke}"
        stroke-width="3"
      />

      ${
        showAnswer
          ? `
            <text
              x="${circleCx}"
              y="${circleCy + 5}"
              text-anchor="middle"
              dominant-baseline="middle"
              font-family="Andika, system-ui, sans-serif"
              font-size="64"
              font-weight="1000"
              fill="${DRAW.textColor}"
            >${currentTarget}</text>
          `
          : ""
      }
    </svg>
  `;
}

function renderBox(boxIndex) {
  const x0 = getBoxX(boxIndex);
  const y0 = DRAW.stripTopY;
  const boxWidth = DRAW.cellsPerBox * DRAW.cellWidth;
  const cellW = DRAW.cellWidth;
  const cellH = DRAW.cellHeight;

  let verticals = "";
  for (let i = 1; i < DRAW.cellsPerBox; i++) {
    const x = x0 + (i * cellW);
    const thick = (i === 5);
    verticals += `
      <line
        x1="${x}"
        y1="${y0}"
        x2="${x}"
        y2="${y0 + cellH}"
        stroke="${DRAW.mainLine}"
        stroke-width="${thick ? 3.5 : 1.6}"
      />
    `;
  }

  const crosses = [3, 8].map((cellIndex) => {
    const cx = x0 + ((cellIndex - 1) * cellW) + (cellW / 2);
    const cy = y0 + (cellH / 2);
    const d = 7;

    return `
      <line
        x1="${cx - d}" y1="${cy - d}"
        x2="${cx + d}" y2="${cy + d}"
        stroke="${DRAW.crossLine}"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <line
        x1="${cx + d}" y1="${cy - d}"
        x2="${cx - d}" y2="${cy + d}"
        stroke="${DRAW.crossLine}"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    `;
  }).join("");

  const firstCellLabel = boxIndex === 0
    ? `
      <text
        x="${x0 + (cellW / 2)}"
        y="${y0 + 30}"
        text-anchor="middle"
        font-family="Andika, system-ui, sans-serif"
        font-size="28"
        font-weight="1000"
        fill="${DRAW.textColor}"
      >1</text>
    `
    : "";

  return `
    <g>
      <rect
        x="${x0}"
        y="${y0}"
        width="${boxWidth}"
        height="${cellH}"
        fill="${DRAW.stripFill}"
        stroke="${DRAW.stripStroke}"
        stroke-width="2"
      />

      ${verticals}
      ${crosses}
      ${firstCellLabel}
    </g>
  `;
}

function getBoxX(boxIndex) {
  const boxWidth = DRAW.cellsPerBox * DRAW.cellWidth;
  return DRAW.leftPadding + boxIndex * (boxWidth + DRAW.boxGap);
}

function getCellCenterX(value) {
  const zeroBased = value - 1;
  const boxIndex = Math.floor(zeroBased / DRAW.cellsPerBox);
  const cellIndexInBox = zeroBased % DRAW.cellsPerBox;

  const boxX = getBoxX(boxIndex);
  return boxX + (cellIndexInBox * DRAW.cellWidth) + (DRAW.cellWidth / 2);
}

function refillValuePool(settings) {
  const values = [];
  for (let n = settings.minValue; n <= settings.maxValue; n++) {
    values.push(n);
  }

  valuePool = shuffle(values);

  if (lastTarget !== null && valuePool.length > 1 && valuePool[valuePool.length - 1] === lastTarget) {
    const lastIndex = valuePool.length - 1;
    const swapIndex = valuePool.length - 2;
    [valuePool[lastIndex], valuePool[swapIndex]] = [valuePool[swapIndex], valuePool[lastIndex]];
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}