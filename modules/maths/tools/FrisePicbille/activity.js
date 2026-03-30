import {
  DRAW,
  normalizeSettings,
  refillValuePool
} from "./model.js";

let currentTarget = null;
let valuePool = [];
let lastTarget = null;

export function mount(container) {
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
}

export function nextQuestion(container, ctx) {
  const settings = normalizeSettings(ctx?.settings);

  if (valuePool.length === 0) {
    valuePool = refillValuePool(settings, lastTarget);
  }

  currentTarget = valuePool.pop();
  lastTarget = currentTarget;

  renderExercise(container, false, settings);
}

export function showAnswer(container, ctx) {
  const settings = normalizeSettings(ctx?.settings);
  renderExercise(container, true, settings);
}

export function unmount(container) {
  container.innerHTML = "";
  currentTarget = null;
  valuePool = [];
  lastTarget = null;
}

function renderExercise(container, showAnswer, settings) {
  const host = container.querySelector("#picbilleHost");
  if (!host || currentTarget == null) return;

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
