import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  OPERATION_TYPES
} from "./model.js";

let currentQuestion = null;
let lastQuestionId = null;

export function mount(container) {
  container.innerHTML = `
    <div class="tool-center">
      <div class="tool-big" id="op_expr"></div>
    </div>
  `;
}

export function nextQuestion(container, ctx) {
  currentQuestion = pickQuestion(normalizeSettings(ctx?.settings), {
    avoidKey: lastQuestionId
  });
  lastQuestionId = questionKey(currentQuestion);

  const expr = container.querySelector("#op_expr");
  if (expr) {
    expr.textContent = formatQuestion(currentQuestion);
  }
}

export function showAnswer(container) {
  if (!currentQuestion) return;
  const expr = container.querySelector("#op_expr");
  if (expr) {
    expr.textContent = formatAnswer(currentQuestion);
  }
}

export function unmount(container) {
  container.innerHTML = "";
  currentQuestion = null;
  lastQuestionId = null;
}

function formatQuestion(question) {
  switch (question?.operation) {
    case OPERATION_TYPES.ADDITION:
      return `${question.n1} + ${question.n2}`;
    case OPERATION_TYPES.SUBTRACTION:
      return `${question.n1} - ${question.n2}`;
    case OPERATION_TYPES.MULTIPLICATION:
      return `${question.n1} × ${question.n2}`;
    case OPERATION_TYPES.DIVISION:
      return `${question.n1} : ${question.n2} ?`;
    default:
      return "";
  }
}

function formatAnswer(question) {
  switch (question?.operation) {
    case OPERATION_TYPES.ADDITION:
      return `${question.n1} + ${question.n2} = ${question.result}`;
    case OPERATION_TYPES.SUBTRACTION:
      return `${question.n1} - ${question.n2} = ${question.result}`;
    case OPERATION_TYPES.MULTIPLICATION:
      return `${question.n1} × ${question.n2} = ${question.result}`;
    case OPERATION_TYPES.DIVISION:
      return `q = ${question.quotient} et r = ${question.remainder}`;
    default:
      return "";
  }
}
