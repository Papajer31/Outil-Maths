import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderSection,
  renderCheckbox,
  readCheckbox,
  clampInt
} from "../toolVariables.js";

let currentQuestion = null;
let questionPool = [];
let lastQuestionKey = null;

export default {
  getDefaultSettings(){
    return {
      minTop: 5,
      maxTop: 9,
      allowZero: false,
      includeSymmetricPairs: true
    };
  },

  renderToolSettings(container, settings){
    const cfg = normalizeSettings(settings);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">

        ${renderMinMax({
          idPrefix: "da_top",
          title: "Nombres à décomposer",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.minTop,
          maxValue: cfg.maxTop,
          inputMin: 1,
          inputMax: 99,
          step: 1
        })}

        ${renderSection("Options", `
          <div class="tv-stack">
            ${renderCheckbox({
              id: "da_allowZero",
              label: "Autoriser 0 dans la décomposition",
              checked: cfg.allowZero
            })}

            ${renderCheckbox({
              id: "da_includeSymmetricPairs",
              label: "Autoriser les paires symétriques (ex. 2 + 3 et 3 + 2)",
              checked: cfg.includeSymmetricPairs
            })}
          </div>
        `)}

      </div>
    `;

    bindMinMax(container, "da_top", {
      inputMin: 1,
      inputMax: 99
    });

    const minEl = container.querySelector("#da_top_min");
    const maxEl = container.querySelector("#da_top_max");
    const allowZeroEl = container.querySelector("#da_allowZero");

    const syncSpecific = () => {
      minEl.value = String(clampInt(minEl.value, 1, 99));
      maxEl.value = String(clampInt(maxEl.value, 1, 99));

      if (Number(minEl.value) > Number(maxEl.value)){
        minEl.value = maxEl.value;
      }

      // Si zéro interdit, top = 1 ne produit aucune décomposition utile.
      if (!allowZeroEl.checked && Number(maxEl.value) < 2){
        maxEl.value = "2";
        if (Number(minEl.value) > 2){
          minEl.value = "2";
        }
      }
    };

    minEl?.addEventListener("input", syncSpecific);
    maxEl?.addEventListener("input", syncSpecific);
    minEl?.addEventListener("change", syncSpecific);
    maxEl?.addEventListener("change", syncSpecific);
    allowZeroEl?.addEventListener("change", syncSpecific);

    syncSpecific();
  },

  readToolSettings(container){
    const topRange = readMinMax(container, "da_top", {
      inputMin: 1,
      inputMax: 99,
      errorLabel: "Les bornes des nombres à décomposer"
    });

    const allowZero = readCheckbox(container, "da_allowZero");
    const includeSymmetricPairs = readCheckbox(container, "da_includeSymmetricPairs");

    if (!allowZero && topRange.max < 2){
      throw new Error("Avec 0 interdit, le maximum doit être au moins 2.");
    }

    const settings = {
      minTop: topRange.min,
      maxTop: topRange.max,
      allowZero,
      includeSymmetricPairs
    };

    const pool = buildQuestionPool(settings);
    if (pool.length === 0){
      throw new Error("Cette configuration ne produit aucune décomposition possible.");
    }

    return settings;
  },

  mount(container, ctx) {
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

              <div
                class="tool-number"
                style="line-height:1;"
              >+</div>

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
  },

  nextQuestion(container, ctx) {
    const settings = normalizeSettings(ctx?.settings);

    if (questionPool.length === 0) {
      refillQuestionPool(settings);
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
  },

  showAnswer(container, ctx) {
    const answerSlot = container.querySelector("#decompAnswerSlot");
    if (!answerSlot || !currentQuestion) return;

    answerSlot.innerHTML = `
      <div class="tool-number" style="line-height:1;">
        ${currentQuestion.answer}
      </div>
    `;
  },

  unmount(container) {
    container.innerHTML = "";
    currentQuestion = null;
    questionPool = [];
    lastQuestionKey = null;
  }
};

function normalizeSettings(settings){
  const base = {
    minTop: 5,
    maxTop: 9,
    allowZero: false,
    includeSymmetricPairs: true,
    ...(settings ?? {})
  };

  base.minTop = clampInt(base.minTop, 1, 99);
  base.maxTop = clampInt(base.maxTop, 1, 99);

  if (base.minTop > base.maxTop){
    const tmp = base.minTop;
    base.minTop = base.maxTop;
    base.maxTop = tmp;
  }

  if (!base.allowZero && base.maxTop < 2){
    base.maxTop = 2;
    if (base.minTop > 2){
      base.minTop = 2;
    }
  }

  return base;
}

function refillQuestionPool(settings) {
  questionPool = shuffle(buildQuestionPool(settings));

  if (
    lastQuestionKey !== null &&
    questionPool.length > 1 &&
    questionKey(questionPool[questionPool.length - 1]) === lastQuestionKey
  ) {
    const lastIndex = questionPool.length - 1;
    const swapIndex = questionPool.length - 2;
    [questionPool[lastIndex], questionPool[swapIndex]] =
      [questionPool[swapIndex], questionPool[lastIndex]];
  }
}

function buildQuestionPool(settings) {
  const pool = [];

  for (let top = settings.minTop; top <= settings.maxTop; top++) {
    const minGiven = settings.allowZero ? 0 : 1;

    if (settings.includeSymmetricPairs) {
      for (let given = minGiven; given <= top; given++) {
        const answer = top - given;
        if (!settings.allowZero && answer === 0) continue;

        pool.push({ top, given, answer });
      }
    } else {
      for (let given = minGiven; given <= Math.floor(top / 2); given++) {
        const answer = top - given;
        if (!settings.allowZero && answer === 0) continue;

        pool.push({ top, given, answer });
      }
    }
  }

  return pool;
}

function questionKey(q) {
  return `${q.top}|${q.given}|${q.answer}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}