import {
  normalizeSettings,
  pickQuestion,
  questionKey
} from "./model.js";

let currentQuestion = null;
let lastQuestionId = null;

export function mount(container) {
  container.innerHTML = `
    <div class="tool-center">
      <div style="
        width:min(1400px, 100%);
        height:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:28px 20px;
        box-sizing:border-box;
      ">
        <div id="furet_host" style="width:100%;"></div>
      </div>
    </div>
  `;
}

export function nextQuestion(container, ctx) {
  const settings = normalizeSettings(ctx?.settings);
  currentQuestion = pickQuestion(settings, {
    avoidKey: lastQuestionId,
    attempts: 120
  });

  if (!currentQuestion) {
    throw new Error("Impossible de générer une question pour Furet avec ces réglages.");
  }

  lastQuestionId = questionKey(currentQuestion);
  renderExercise(container, false);
}

export function showAnswer(container) {
  renderExercise(container, true);
}

export function unmount(container) {
  container.innerHTML = "";
  currentQuestion = null;
  lastQuestionId = null;
}

function renderExercise(container, showAnswer) {
  const host = container.querySelector("#furet_host");
  if (!host || !currentQuestion) return;

  const geometry = resolveGeometry(currentQuestion);
  const svg = renderSvg(currentQuestion, showAnswer, geometry);

  host.innerHTML = `
    <div style="
      width:100%;
      display:flex;
      align-items:center;
      justify-content:center;
    ">
      ${svg}
    </div>
  `;
}

function resolveGeometry(question) {
  const nodeCount = Array.isArray(question?.values) ? question.values.length : 0;
  const opLabels = Array.isArray(question?.stepLabels) ? question.stepLabels : [];
  const maxDigits = Math.max(...(question?.values || [0]).map((value) => String(Math.abs(value)).length), 1);
  const maxOpLength = Math.max(...opLabels.map((label) => String(label).length), 2);

  const circleRadius = maxDigits >= 3 ? 52 : 48;
  const circleDiameter = circleRadius * 2;
  const opWidth = Math.max(88, 34 + (maxOpLength * 18));
  const segmentGap = opWidth + 46;
  const paddingX = 32;
  const circleY = 178;
  const svgHeight = 260;
  const svgWidth = (paddingX * 2) + circleDiameter + Math.max(0, nodeCount - 1) * (circleDiameter + segmentGap);

  return {
    nodeCount,
    circleRadius,
    circleDiameter,
    opWidth,
    opHeight: 38,
    segmentGap,
    paddingX,
    circleY,
    svgWidth,
    svgHeight,
    numberFontSize: maxDigits >= 3 ? 44 : 52,
    opFontSize: maxOpLength >= 4 ? 28 : 30,
    border: "#57aede",
    finalBorder: "#6fbe6c",
    filledCircle: "#efe8cb",
    emptyCircle: "#ffffff",
    finalCircle: "#e5f4df",
    startText: "#1960aa",
    answerText: "#6f737b",
    finalText: "#c03c8d",
    arrow: "#ffffff",
    opFill: "rgba(255,255,255,.92)",
    opStroke: "rgba(87,174,222,.58)",
    opText: "#26211e"
  };
}

function renderSvg(question, showAnswer, geo) {
  const circles = [];
  const arrows = [];
  const operations = [];

  for (let index = 0; index < geo.nodeCount; index += 1) {
    const cx = getCircleCenterX(index, geo);
    const isStart = index === 0;
    const isLast = index === geo.nodeCount - 1;
    const value = question.values[index];
    const showValue = showAnswer || isStart;
    const circleFill = isLast
      ? geo.finalCircle
      : (showValue ? geo.filledCircle : geo.emptyCircle);
    const circleStroke = isLast ? geo.finalBorder : geo.border;
    const textColor = isStart
      ? geo.startText
      : (isLast ? geo.finalText : geo.answerText);

    circles.push(`
      <circle
        cx="${cx}"
        cy="${geo.circleY}"
        r="${geo.circleRadius}"
        fill="${circleFill}"
        stroke="${circleStroke}"
        stroke-width="4"
      />

      ${showValue ? `
        <text
          x="${cx}"
          y="${geo.circleY + 3}"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="Andika, system-ui, sans-serif"
          font-size="${geo.numberFontSize}"
          font-weight="700"
          fill="${textColor}"
        >${escapeHtml(String(value))}</text>
      ` : ""}
    `);

    if (index >= geo.nodeCount - 1) continue;

    const nextCx = getCircleCenterX(index + 1, geo);
    const midX = (cx + nextCx) / 2;
    const baseY = geo.circleY - geo.circleRadius - 10;
    const controlY = baseY - 58;
    const arrowEndX = nextCx - (geo.circleRadius * 0.8);
    const arrowStartX = cx + (geo.circleRadius * 0.8);
    const arrowEndY = baseY;
    const tangentDx = arrowEndX - midX;
    const tangentDy = arrowEndY - controlY;
    const length = Math.hypot(tangentDx, tangentDy) || 1;
    const unitX = tangentDx / length;
    const unitY = tangentDy / length;
    const arrowSize = 10;
    const normalX = -unitY;
    const normalY = unitX;
    const arrowLeftX = arrowEndX - (unitX * arrowSize) + (normalX * (arrowSize * 0.7));
    const arrowLeftY = arrowEndY - (unitY * arrowSize) + (normalY * (arrowSize * 0.7));
    const arrowRightX = arrowEndX - (unitX * arrowSize) - (normalX * (arrowSize * 0.7));
    const arrowRightY = arrowEndY - (unitY * arrowSize) - (normalY * (arrowSize * 0.7));

    arrows.push(`
      <path
        d="M ${arrowStartX} ${baseY} Q ${midX} ${controlY} ${arrowEndX} ${arrowEndY}"
        fill="none"
        stroke="${geo.arrow}"
        stroke-width="4"
        stroke-linecap="round"
      />
      <path
        d="M ${arrowLeftX} ${arrowLeftY} L ${arrowEndX} ${arrowEndY} L ${arrowRightX} ${arrowRightY}"
        fill="none"
        stroke="${geo.arrow}"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    `);

    const opX = midX - (geo.opWidth / 2);
    const opY = baseY - 74;
    operations.push(`
      <g>
        <rect
          x="${opX}"
          y="${opY}"
          width="${geo.opWidth}"
          height="${geo.opHeight}"
          rx="0"
          fill="${geo.opFill}"
          stroke="${geo.opStroke}"
          stroke-width="2"
        />
        <text
          x="${midX}"
          y="${opY + (geo.opHeight / 2) + 2}"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="Andika, system-ui, sans-serif"
          font-size="${geo.opFontSize}"
          font-weight="700"
          fill="${geo.opText}"
        >${escapeHtml(question.stepLabels[index])}</text>
      </g>
    `);
  }

  return `
    <svg
      viewBox="0 0 ${geo.svgWidth} ${geo.svgHeight}"
      aria-hidden="true"
      style="display:block; width:100%; max-width:${geo.svgWidth}px; height:auto; overflow:visible;"
    >
      ${operations.join("")}
      ${arrows.join("")}
      ${circles.join("")}
    </svg>
  `;
}

function getCircleCenterX(index, geo) {
  return geo.paddingX + geo.circleRadius + index * (geo.circleDiameter + geo.segmentGap);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
