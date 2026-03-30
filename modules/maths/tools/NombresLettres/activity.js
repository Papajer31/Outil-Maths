import {
  NUMBERS,
  normalizeSettings,
  pickNumber
} from "./model.js";

let currentNumber = 0;
let lastNumber = -1;
let answerSrc = "";

const QUESTION_SRC = new URL("./seyes.png", import.meta.url).href;
const preloadCache = new Map();

export function mount(container) {
  container.innerHTML = `
    <div class="tool-center">
      <div class="tool-row">
        <div class="tool-number" id="toolNumber"></div>
        <div class="tool-number">→</div>
        <img class="tool-img" id="toolSeyes" src="${QUESTION_SRC}" alt="">
      </div>
    </div>
  `;
}

export function nextQuestion(container, ctx) {
  currentNumber = pickNumber(normalizeSettings(ctx?.settings), lastNumber);
  lastNumber = currentNumber;

  const numEl = container.querySelector("#toolNumber");
  const img = container.querySelector("#toolSeyes");

  answerSrc = new URL(`./labels/${NUMBERS[currentNumber]}.png`, import.meta.url).href;

  if (numEl) numEl.textContent = String(currentNumber);
  setImageWhenReady(img, QUESTION_SRC);
  preloadImage(answerSrc);
}

export function showAnswer(container) {
  const img = container.querySelector("#toolSeyes");
  setImageWhenReady(img, answerSrc);
}

export function unmount(container) {
  container.innerHTML = "";
  currentNumber = 0;
  lastNumber = -1;
  answerSrc = "";
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
