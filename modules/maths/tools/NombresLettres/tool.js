import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  clampInt
} from "../../toolVariables.js";

const NUMBERS = [
  "zero",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf"
];

let currentNumber = 0;
let last = -1;

const ASSET_BASE = "./modules/maths/tools/NombresLettres";

let questionSrc = `${ASSET_BASE}/seyes.png`;
let answerSrc = "";

const preloadCache = new Map();

export default {
  getDefaultSettings(){
    return {
      min: 0,
      max: 19
    };
  },

  renderToolSettings(container, settings){
    const cfg = normalizeSettings(settings);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${renderMinMax({
          idPrefix: "nl_values",
          title: "Nombres",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.min,
          maxValue: cfg.max,
          inputMin: 0,
          inputMax: NUMBERS.length - 1,
          step: 1
        })}
      </div>
    `;

    bindMinMax(container, "nl_values", {
      inputMin: 0,
      inputMax: NUMBERS.length - 1
    });
  },

  readToolSettings(container){
    const values = readMinMax(container, "nl_values", {
      inputMin: 0,
      inputMax: NUMBERS.length - 1,
      errorLabel: "Les bornes des nombres"
    });

    return {
      min: values.min,
      max: values.max
    };
  },

  mount(container, ctx){
    container.innerHTML = `
      <div class="tool-center">
        <div class="tool-row">

          <div class="tool-number" id="toolNumber"></div>

          <div class="tool-number">→</div>

          <img class="tool-img" id="toolSeyes" src="${ASSET_BASE}/seyes.png">

        </div>
      </div>
    `;
  },

  nextQuestion(container, ctx){
    const settings = normalizeSettings(ctx?.settings);

    if (settings.min === settings.max){
      currentNumber = settings.min;
    } else {
      do {
        currentNumber = rand(settings.min, settings.max);
      } while (currentNumber === last);
    }

    last = currentNumber;

    const numEl = container.querySelector("#toolNumber");
    const img = container.querySelector("#toolSeyes");

    questionSrc = `${ASSET_BASE}/seyes.png`;
    answerSrc = `${ASSET_BASE}/labels/${NUMBERS[currentNumber]}.png`;

    numEl.textContent = currentNumber;

    setImageWhenReady(img, questionSrc);
    preloadImage(answerSrc);
  },

  showAnswer(container, ctx){
    const img = container.querySelector("#toolSeyes");
    setImageWhenReady(img, answerSrc);
  },

  unmount(container){
    container.innerHTML = "";
    currentNumber = 0;
    last = -1;
    questionSrc = `${ASSET_BASE}/seyes.png`;
    answerSrc = "";
  }
};

function normalizeSettings(settings){
  const base = {
    min: 0,
    max: 19,
    ...(settings ?? {})
  };

  base.min = clampInt(base.min, 0, NUMBERS.length - 1);
  base.max = clampInt(base.max, 0, NUMBERS.length - 1);

  if (base.min > base.max){
    const tmp = base.min;
    base.min = base.max;
    base.max = tmp;
  }

  return base;
}

function preloadImage(src){
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

function setImageWhenReady(imgEl, src){
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

function rand(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}