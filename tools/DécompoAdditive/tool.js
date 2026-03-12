const SETTINGS = {
  minTop: 5,
  maxTop: 9,
  allowZero: true,
  includeSymmetricPairs: true // false = 2+3 sans 3+2
};

let currentQuestion = null;
let questionPool = [];
let lastQuestionKey = null;

export default {
  mount(container) {
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

  nextQuestion(container) {
    if (questionPool.length === 0) {
      refillQuestionPool();
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

  showAnswer(container) {
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
  }
};

function refillQuestionPool() {
  questionPool = shuffle(buildQuestionPool(SETTINGS));

  // Évite que la 1re question du nouveau cycle
  // soit identique à la dernière du cycle précédent.
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