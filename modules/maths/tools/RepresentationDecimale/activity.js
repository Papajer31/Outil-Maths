import {
  normalizeSettings,
  pickQuestion
} from "./model.js";

let currentQuestion = {
  n: 10,
  character: "picbille",
  questionSrc: "",
  answerSrc: ""
};

const preloadCache = new Map();

export function mount(container) {
  container.innerHTML = `
    <div style="
      width:100%;
      height:100%;
      display:flex;
      align-items:center;
      justify-content:center;
    ">
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        gap:120px;
        width:100%;
        height:100%;
      ">
        <div id="rd_number" style="
          font-family:'Andika', system-ui, sans-serif;
          font-weight:1000;
          font-size:140px;
          line-height:1;
          color:var(--text, #e9edf5);
          flex:0 0 auto;
        "></div>

        <div id="rd_visual_host" style="
          width:520px;
          height:360px;
          display:flex;
          align-items:center;
          justify-content:center;
          flex:0 0 auto;
        ">
          <div id="rd_answer_frame" style="
            width:100%;
            height:100%;
            display:flex;
            align-items:center;
            justify-content:center;
            border:1px solid transparent;
            border-radius:18px;
            background:transparent;
            padding:0;
            box-sizing:border-box;
            transition:all 120ms ease;
          ">
            <img
              id="rd_img"
              alt=""
              style="
                display:block;
                width:100%;
                height:100%;
                object-fit:contain;
              "
            >
          </div>
        </div>
      </div>
    </div>
  `;
}

export function nextQuestion(container, ctx) {
  const settings = normalizeSettings(ctx?.settings);
  const { n, character } = pickQuestion(settings);

  const questionSrc = new URL(`./${character}.png`, import.meta.url).href;
  const answerSrc = new URL(`./graphs/${character}/${n}.png`, import.meta.url).href;

  currentQuestion = { n, character, questionSrc, answerSrc };

  const numberEl = container.querySelector("#rd_number");
  const img = container.querySelector("#rd_img");
  const frame = container.querySelector("#rd_answer_frame");

  if (!numberEl || !img || !frame) return;

  numberEl.textContent = String(n);

  frame.style.borderColor = "transparent";
  frame.style.background = "transparent";
  frame.style.padding = "0";

  img.style.width = "70%";
  img.style.height = "70%";
  img.style.objectFit = "contain";

  setImageWhenReady(img, questionSrc);
  preloadImage(answerSrc);
}

export function showAnswer(container) {
  const img = container.querySelector("#rd_img");
  const frame = container.querySelector("#rd_answer_frame");
  if (!img || !frame) return;

  frame.style.borderColor = "var(--border, #2b3142)";
  frame.style.background = "var(--panel, #171a21)";
  frame.style.padding = "18px";

  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";

  setImageWhenReady(img, currentQuestion.answerSrc);
}

export function unmount(container) {
  container.innerHTML = "";
  currentQuestion = {
    n: 10,
    character: "picbille",
    questionSrc: "",
    answerSrc: ""
  };
}

function preloadImage(src) {
  if (!src) return Promise.resolve();

  const existing = preloadCache.get(src);
  if (existing) return existing;

  const p = new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });

  preloadCache.set(src, p);
  return p;
}

function setImageWhenReady(imgEl, src) {
  if (!imgEl || !src) return;

  imgEl.dataset.expectedSrc = src;

  preloadImage(src)
    .then(() => {
      if (imgEl.dataset.expectedSrc !== src) return;
      imgEl.src = src;
    })
    .catch(() => {
      if (imgEl.dataset.expectedSrc !== src) return;
      imgEl.src = src;
    });
}
