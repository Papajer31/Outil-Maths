import {
  normalizeSettings,
  refillQuestionPool,
  questionKey
} from "./model.js";

let currentQuestion = null;
let questionPool = [];
let lastQuestionKey = null;

export function mount(container) {
  container.innerHTML = `
    <div class="tool-center">
      <div id="decompRoot" style="
        width:100%;
        height:100%;
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        <div style="
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:48px;
          transform: translateY(-10px);
        ">

          <div
            id="decompTop"
            class="tool-number"
            style="line-height:1;"
          ></div>

          <svg
            width="420"
            height="190"
            viewBox="0 0 420 190"
            aria-hidden="true"
            style="overflow:visible;"
          >
            <line
              x1="210"
              y1="0"
              x2="95"
              y2="180"
              stroke="currentColor"
              stroke-width="10"
              stroke-linecap="round"
            />
            <line
              x1="210"
              y1="0"
              x2="325"
              y2="180"
              stroke="currentColor"
              stroke-width="10"
              stroke-linecap="round"
            />
          </svg>

          <div style="
            width:560px;
            display:flex;
            align-items:center;
            justify-content:center;
            gap:48px;
            margin-top:-8px;
          ">
            <div
              id="decompGiven"
              class="tool-number"
              style="
                min-width:120px;
                text-align:right;
                line-height:1;
              "
            ></div>

            <div class="tool-number" style="line-height:1;">+</div>

            <div
              id="decompAnswerSlot"
              style="
                width:220px;
                height:150px;
                border:6px solid currentColor;
                border-radius:22px;
                display:flex;
                align-items:center;
                justify-content:center;
                box-sizing:border-box;
              "
            ></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function nextQuestion(container, ctx) {
  const settings = normalizeSettings(ctx?.settings);

  if (questionPool.length === 0) {
    questionPool = refillQuestionPool(settings, lastQuestionKey);
  }

  currentQuestion = questionPool.pop();
  lastQuestionKey = questionKey(currentQuestion);

  const topEl = container.querySelector("#decompTop");
  const givenEl = container.querySelector("#decompGiven");
  const answerSlot = container.querySelector("#decompAnswerSlot");

  if (topEl) topEl.textContent = String(currentQuestion.top);
  if (givenEl) givenEl.textContent = String(currentQuestion.given);

  if (answerSlot) {
    answerSlot.innerHTML = "";
    answerSlot.style.borderColor = "currentColor";
  }
}

export function showAnswer(container) {
  const answerSlot = container.querySelector("#decompAnswerSlot");
  if (!answerSlot || !currentQuestion) return;

  answerSlot.innerHTML = `
    <div class="tool-number" style="line-height:1;">
      ${currentQuestion.answer}
    </div>
  `;
}

export function unmount(container) {
  container.innerHTML = "";
  currentQuestion = null;
  questionPool = [];
  lastQuestionKey = null;
}
