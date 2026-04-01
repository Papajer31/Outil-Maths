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
        width:min(1280px, 100%);
        height:100%;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:34px;
        padding:28px 24px 20px;
        box-sizing:border-box;
      ">
        <div id="baj_prompt" style="
          display:flex;
          align-items:baseline;
          justify-content:center;
          flex-wrap:wrap;
          gap:18px;
          text-align:center;
          color:var(--text, #e9edf5);
          font-family:'Andika', system-ui, sans-serif;
          font-weight:1000;
          line-height:1.05;
        ">
          <span style="font-size:clamp(34px, 4vw, 58px);">Je veux</span>
          <span id="baj_target_value" style="font-size:clamp(64px, 8vw, 108px);"></span>
          <span style="font-size:clamp(34px, 4vw, 58px);">jetons</span>
        </div>

        <div id="baj_boxes" style="
          width:100%;
          display:grid;
          gap:18px;
          align-items:end;
        "></div>

        <div id="baj_answers" style="
          width:100%;
          min-height:96px;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:16px;
          flex-wrap:wrap;
          opacity:0;
          transition:opacity 120ms ease;
          pointer-events:none;
        "></div>
      </div>
    </div>
  `;
}

export function nextQuestion(container, ctx) {
  const settings = normalizeSettings(ctx?.settings);
  currentQuestion = pickQuestion(settings, {
    avoidKey: lastQuestionId,
    attempts: 1500
  });

  if (!currentQuestion) {
    throw new Error("Impossible de générer une question pour Boites à jetons avec ces réglages.");
  }

  lastQuestionId = questionKey(currentQuestion);

  const targetEl = container.querySelector("#baj_target_value");
  const boxesEl = container.querySelector("#baj_boxes");
  const answersEl = container.querySelector("#baj_answers");

  if (targetEl) {
    targetEl.textContent = String(currentQuestion.target);
  }

  if (boxesEl) {
    boxesEl.style.gridTemplateColumns = `repeat(${currentQuestion.values.length}, minmax(0, 1fr))`;
    boxesEl.innerHTML = currentQuestion.values
      .map((value) => `
        <div style="display:flex; justify-content:center; width:100%;">
          ${renderBoxSvg(value)}
        </div>
      `)
      .join("");
  }

  if (answersEl) {
    answersEl.innerHTML = "";
    answersEl.style.opacity = "0";
  }
}

export function showAnswer(container) {
  if (!currentQuestion) return;

  const answersEl = container.querySelector("#baj_answers");
  if (!answersEl) return;

  answersEl.innerHTML = currentQuestion.answerLines
    .map((line) => `
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        min-height:72px;
        padding:14px 22px;
        border:2px solid var(--border, #2b3142);
        border-radius:18px;
        background:var(--panel, #171a21);
        color:var(--text, #e9edf5);
        font-family:'Andika', system-ui, sans-serif;
        font-weight:1000;
        font-size:clamp(26px, 3vw, 40px);
        line-height:1.1;
        text-align:center;
        box-sizing:border-box;
        box-shadow:0 6px 18px rgba(0, 0, 0, .18);
      ">${escapeHtml(line)}</div>
    `)
    .join("");

  answersEl.style.opacity = "1";
}

export function unmount(container) {
  container.innerHTML = "";
  currentQuestion = null;
  lastQuestionId = null;
}

function renderBoxSvg(value) {
  return `
    <svg
      viewBox="0 0 220 200"
      aria-hidden="true"
      style="
        display:block;
        width:min(100%, 178px);
        height:auto;
        overflow:visible;
        filter:drop-shadow(0 8px 16px rgba(0,0,0,.14));
      "
    >
      <polygon
        points="34,18 186,18 198,28 22,28"
        fill="#f0c991"
        stroke="#8f6738"
        stroke-width="2.5"
      />

      <rect
        x="18"
        y="28"
        width="184"
        height="34"
        rx="3"
        fill="#e0b47c"
        stroke="#8f6738"
        stroke-width="2.5"
      />

      <rect
        x="24"
        y="62"
        width="172"
        height="120"
        rx="3"
        fill="#d7a46d"
        stroke="#8f6738"
        stroke-width="2.5"
      />

      <line
        x1="24"
        y1="62"
        x2="196"
        y2="62"
        stroke="#7c5528"
        stroke-width="2"
        opacity=".45"
      />

      <text
        x="110"
        y="130"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Andika, system-ui, sans-serif"
        font-size="84"
        font-weight="700"
        fill="#101010"
      >${escapeHtml(String(value))}</text>
    </svg>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
