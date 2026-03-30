import {
  normalizeSettings,
  refillNumberPool
} from "./model.js";

let currentN = null;
let numberPool = [];
let lastN = null;

export function mount(container) {
  container.innerHTML = `
    <div class="tool-center">
      <div class="tool-big" id="td_expr"></div>
    </div>
  `;
}

export function nextQuestion(container, ctx) {
  const settings = normalizeSettings(ctx?.settings);

  if (numberPool.length === 0) {
    numberPool = refillNumberPool(settings, lastN);
  }

  currentN = numberPool.pop();
  lastN = currentN;

  container.querySelector("#td_expr").textContent = `${currentN} + ${currentN}`;
}

export function showAnswer(container) {
  if (currentN == null) return;
  container.querySelector("#td_expr").textContent = `${currentN} + ${currentN} = ${currentN * 2}`;
}

export function unmount(container) {
  container.innerHTML = "";
  currentN = null;
  numberPool = [];
  lastN = null;
}
