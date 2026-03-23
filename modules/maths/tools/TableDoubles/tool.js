import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  clampInt
} from "../../toolVariables.js";

let currentN = null;
let numberPool = [];
let lastN = null;

export default {
  getDefaultSettings(){
    return {
      minBase: 1,
      maxBase: 10
    };
  },

  renderToolSettings(container, settings){
    const cfg = normalizeSettings(settings);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${renderMinMax({
          idPrefix: "td_base",
          title: "Nombres de base",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.minBase,
          maxValue: cfg.maxBase,
          inputMin: 1,
          inputMax: 99,
          step: 1
        })}
      </div>
    `;

    bindMinMax(container, "td_base", {
      inputMin: 1,
      inputMax: 99
    });
  },

  readToolSettings(container){
    const base = readMinMax(container, "td_base", {
      inputMin: 1,
      inputMax: 99,
      errorLabel: "Les bornes des nombres de base"
    });

    return {
      minBase: base.min,
      maxBase: base.max
    };
  },

  mount(container, ctx){
    container.innerHTML = `
      <div class="tool-center">
        <div class="tool-big" id="td_expr"></div>
      </div>
    `;
  },

  nextQuestion(container, ctx){
    const settings = normalizeSettings(ctx?.settings);

    if (numberPool.length === 0){
      refillNumberPool(settings);
    }

    currentN = numberPool.pop();
    lastN = currentN;

    container.querySelector("#td_expr").textContent = `${currentN} + ${currentN}`;
  },

  showAnswer(container, ctx){
    if (currentN == null) return;
    container.querySelector("#td_expr").textContent = `${currentN} + ${currentN} = ${currentN * 2}`;
  },

  unmount(container){
    container.innerHTML = "";
    currentN = null;
    numberPool = [];
    lastN = null;
  }
};

function normalizeSettings(settings){
  const base = {
    minBase: 1,
    maxBase: 10,
    ...(settings ?? {})
  };

  base.minBase = clampInt(base.minBase, 1, 99);
  base.maxBase = clampInt(base.maxBase, 1, 99);

  if (base.minBase > base.maxBase){
    const tmp = base.minBase;
    base.minBase = base.maxBase;
    base.maxBase = tmp;
  }

  return base;
}

function refillNumberPool(settings){
  const values = [];
  for (let n = settings.minBase; n <= settings.maxBase; n++){
    values.push(n);
  }

  numberPool = shuffle(values);

  if (
    lastN !== null &&
    numberPool.length > 1 &&
    numberPool[numberPool.length - 1] === lastN
  ){
    const lastIndex = numberPool.length - 1;
    const swapIndex = numberPool.length - 2;
    [numberPool[lastIndex], numberPool[swapIndex]] =
      [numberPool[swapIndex], numberPool[lastIndex]];
  }
}

function shuffle(arr){
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}