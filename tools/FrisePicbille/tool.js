const SETTINGS = {
  boxCount: 6,
  cellsPerBox: 10,
  minValue: 11,
  maxValue: 60,

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
  mount(container) {
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

  nextQuestion(container) {
    if (valuePool.length === 0) {
      refillValuePool();
    }

    currentTarget = valuePool.pop();
    lastTarget = currentTarget;

    renderExercise(container, false);
  },

  showAnswer(container) {
    renderExercise(container, true);
  },

  unmount(container) {
    container.innerHTML = "";
  }
};

function renderExercise(container, showAnswer) {
  const host = container.querySelector("#picbilleHost");
  if (!host) return;

  const totalWidth =
    SETTINGS.leftPadding +
    (SETTINGS.boxCount * SETTINGS.cellsPerBox * SETTINGS.cellWidth) +
    ((SETTINGS.boxCount - 1) * SETTINGS.boxGap) +
    SETTINGS.rightPadding;

  const svgWidth = totalWidth;
  const svgHeight = SETTINGS.svgHeight;

  const targetCenterX = getCellCenterX(currentTarget);
  const circleCx = targetCenterX;
  const circleCy = SETTINGS.circleTopY;
  const stripTopY = SETTINGS.stripTopY;

  let boxesSvg = "";
  for (let boxIndex = 0; boxIndex < SETTINGS.boxCount; boxIndex++) {
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
        y1="${circleCy + SETTINGS.circleRadius}"
        x2="${circleCx}"
        y2="${stripTopY}"
        stroke="${SETTINGS.mainLine}"
        stroke-width="6"
        stroke-linecap="round"
      />
      
      ${boxesSvg}

      <circle
        cx="${circleCx}"
        cy="${circleCy}"
        r="${SETTINGS.circleRadius}"
        fill="white"
        stroke="${SETTINGS.circleStroke}"
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
              fill="${SETTINGS.textColor}"
            >${currentTarget}</text>
          `
          : ""
      }
    </svg>
  `;
}

function renderBox(boxIndex) {
  const x0 = getBoxX(boxIndex);
  const y0 = SETTINGS.stripTopY;
  const boxWidth = SETTINGS.cellsPerBox * SETTINGS.cellWidth;
  const cellW = SETTINGS.cellWidth;
  const cellH = SETTINGS.cellHeight;

  let verticals = "";
  for (let i = 1; i < SETTINGS.cellsPerBox; i++) {
    const x = x0 + (i * cellW);
    const thick = (i === 5);
    verticals += `
      <line
        x1="${x}"
        y1="${y0}"
        x2="${x}"
        y2="${y0 + cellH}"
        stroke="${SETTINGS.mainLine}"
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
        stroke="${SETTINGS.crossLine}"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <line
        x1="${cx + d}" y1="${cy - d}"
        x2="${cx - d}" y2="${cy + d}"
        stroke="${SETTINGS.crossLine}"
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
        fill="${SETTINGS.textColor}"
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
        fill="${SETTINGS.stripFill}"
        stroke="${SETTINGS.stripStroke}"
        stroke-width="2"
      />

      ${verticals}
      ${crosses}
      ${firstCellLabel}
    </g>
  `;
}

function getBoxX(boxIndex) {
  const boxWidth = SETTINGS.cellsPerBox * SETTINGS.cellWidth;
  return SETTINGS.leftPadding + boxIndex * (boxWidth + SETTINGS.boxGap);
}

function getCellCenterX(value) {
  const zeroBased = value - 1;
  const boxIndex = Math.floor(zeroBased / SETTINGS.cellsPerBox);
  const cellIndexInBox = zeroBased % SETTINGS.cellsPerBox;

  const boxX = getBoxX(boxIndex);
  return boxX + (cellIndexInBox * SETTINGS.cellWidth) + (SETTINGS.cellWidth / 2);
}

function refillValuePool() {
  const values = [];
  for (let n = SETTINGS.minValue; n <= SETTINGS.maxValue; n++) {
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