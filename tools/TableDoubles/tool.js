let baseNumber = 1;
let answerNumber = 2;
let basePool = [];
let lastBaseNumber = null;

export default {
  mount(container) {
    container.innerHTML = `
      <div class="tool-center">
        <div id="doubleRoot" style="
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
              id="doubleAnswerSlot"
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
              width:720px;
              display:flex;
              align-items:center;
              justify-content:center;
              gap:48px;
              margin-top:-8px;
            ">
              <div
                id="doubleLeft"
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
                id="doubleRight"
                class="tool-number"
                style="
                  min-width:120px;
                  text-align:left;
                  line-height:1;
                "
              ></div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  nextQuestion(container) {
    if (basePool.length === 0) {
        refillBasePool();
    }

    baseNumber = basePool.pop();
    lastBaseNumber = baseNumber;
    answerNumber = baseNumber * 2;

    const leftEl = container.querySelector("#doubleLeft");
    const rightEl = container.querySelector("#doubleRight");
    const answerSlot = container.querySelector("#doubleAnswerSlot");

    if (leftEl) leftEl.textContent = String(baseNumber);
    if (rightEl) rightEl.textContent = String(baseNumber);

    if (answerSlot) {
        answerSlot.innerHTML = "";
        answerSlot.style.borderColor = "currentColor";
    }
  },

  showAnswer(container) {
    const answerSlot = container.querySelector("#doubleAnswerSlot");
    if (!answerSlot) return;

    answerSlot.innerHTML = `
      <div class="tool-number" style="line-height:1;">
        ${answerNumber}
      </div>
    `;
  },

  unmount(container) {
    container.innerHTML = "";
  }
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function refillBasePool() {
  basePool = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // Évite le doublon entre la fin du cycle précédent
  // et le début du nouveau cycle.
  if (lastBaseNumber !== null && basePool[basePool.length - 1] === lastBaseNumber) {
    // On échange avec un autre élément si possible
    const swapIndex = basePool.length - 2;
    if (swapIndex >= 0) {
      [basePool[swapIndex], basePool[basePool.length - 1]] =
        [basePool[basePool.length - 1], basePool[swapIndex]];
    }
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