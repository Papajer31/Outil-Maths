import {
  normalizeSettings,
  pickQuestion
} from "./model.js";

let currentQuestion = null;

export function mount(container) {
  container.innerHTML = `
    <div class="tool-center">
      <div class="tool-big" id="pa_expr"></div>
    </div>
  `;
}

export function nextQuestion(container, ctx) {
  currentQuestion = pickQuestion(normalizeSettings(ctx?.settings));
  container.querySelector("#pa_expr").textContent =
    `${currentQuestion.n1} + ${currentQuestion.n2}`;
}

export function showAnswer(container) {
  if (!currentQuestion) return;
  container.querySelector("#pa_expr").textContent =
    `${currentQuestion.n1} + ${currentQuestion.n2} = ${currentQuestion.result}`;
}

export function unmount(container) {
  container.innerHTML = "";
  currentQuestion = null;
}
