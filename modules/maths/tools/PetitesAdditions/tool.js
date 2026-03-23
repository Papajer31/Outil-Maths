import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  clampInt
} from "../../toolVariables.js";

let n1 = 0;
let n2 = 0;
let r = 0;

export default {
  getDefaultSettings(){
    return {
      n1Min: 0,
      n1Max: 10,
      n2Min: 0,
      n2Max: 10,
      resultMin: 5,
      resultMax: 20
    };
  },

  renderToolSettings(container, settings){
    const cfg = normalizeSettings(settings);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${renderMinMax({
          idPrefix: "pa_n1",
          title: "Premier terme",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.n1Min,
          maxValue: cfg.n1Max,
          inputMin: 0,
          inputMax: 99,
          step: 1
        })}

        ${renderMinMax({
          idPrefix: "pa_n2",
          title: "Deuxième terme",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.n2Min,
          maxValue: cfg.n2Max,
          inputMin: 0,
          inputMax: 99,
          step: 1
        })}

        ${renderMinMax({
          idPrefix: "pa_result",
          title: "Résultat",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.resultMin,
          maxValue: cfg.resultMax,
          inputMin: 0,
          inputMax: 198,
          step: 1
        })}
      </div>
    `;

    bindMinMax(container, "pa_n1", {
      inputMin: 0,
      inputMax: 99
    });

    bindMinMax(container, "pa_n2", {
      inputMin: 0,
      inputMax: 99
    });

    bindMinMax(container, "pa_result", {
      inputMin: 0,
      inputMax: 198
    });
  },

  readToolSettings(container){
    const n1Range = readMinMax(container, "pa_n1", {
      inputMin: 0,
      inputMax: 99,
      errorLabel: "Les bornes du premier terme"
    });

    const n2Range = readMinMax(container, "pa_n2", {
      inputMin: 0,
      inputMax: 99,
      errorLabel: "Les bornes du deuxième terme"
    });

    const resultRange = readMinMax(container, "pa_result", {
      inputMin: 0,
      inputMax: 198,
      errorLabel: "Les bornes du résultat"
    });

    const minPossible = n1Range.min + n2Range.min;
    const maxPossible = n1Range.max + n2Range.max;

    if (resultRange.max < minPossible || resultRange.min > maxPossible){
      throw new Error("Aucune addition possible avec ces bornes de résultat.");
    }

    return {
      n1Min: n1Range.min,
      n1Max: n1Range.max,
      n2Min: n2Range.min,
      n2Max: n2Range.max,
      resultMin: resultRange.min,
      resultMax: resultRange.max
    };
  },

  mount(container, ctx){
    container.innerHTML = `
      <div class="tool-center">
        <div class="tool-big" id="pa_expr"></div>
      </div>
    `;
  },

  nextQuestion(container, ctx){
    const settings = normalizeSettings(ctx?.settings);

    let found = false;

    for (let i = 0; i < 500; i++){
      const a = rand(settings.n1Min, settings.n1Max);
      const b = rand(settings.n2Min, settings.n2Max);
      const sum = a + b;

      if (sum < settings.resultMin || sum > settings.resultMax) continue;

      n1 = a;
      n2 = b;
      r = sum;
      found = true;
      break;
    }

    if (!found){
      outer:
      for (let a = settings.n1Min; a <= settings.n1Max; a++){
        for (let b = settings.n2Min; b <= settings.n2Max; b++){
          const sum = a + b;
          if (sum < settings.resultMin || sum > settings.resultMax) continue;

          n1 = a;
          n2 = b;
          r = sum;
          found = true;
          break outer;
        }
      }
    }

    container.querySelector("#pa_expr").textContent = `${n1} + ${n2}`;
  },

  showAnswer(container, ctx){
    container.querySelector("#pa_expr").textContent = `${n1} + ${n2} = ${r}`;
  },

  unmount(container){
    container.innerHTML = "";
    n1 = 0;
    n2 = 0;
    r = 0;
  }
};

function normalizeSettings(settings){
  const base = {
    n1Min: 0,
    n1Max: 10,
    n2Min: 0,
    n2Max: 10,
    resultMin: 5,
    resultMax: 20,
    ...(settings ?? {})
  };

  base.n1Min = clampInt(base.n1Min, 0, 99);
  base.n1Max = clampInt(base.n1Max, 0, 99);
  base.n2Min = clampInt(base.n2Min, 0, 99);
  base.n2Max = clampInt(base.n2Max, 0, 99);
  base.resultMin = clampInt(base.resultMin, 0, 198);
  base.resultMax = clampInt(base.resultMax, 0, 198);

  if (base.n1Min > base.n1Max){
    const tmp = base.n1Min;
    base.n1Min = base.n1Max;
    base.n1Max = tmp;
  }

  if (base.n2Min > base.n2Max){
    const tmp = base.n2Min;
    base.n2Min = base.n2Max;
    base.n2Max = tmp;
  }

  if (base.resultMin > base.resultMax){
    const tmp = base.resultMin;
    base.resultMin = base.resultMax;
    base.resultMax = tmp;
  }

  return base;
}

function rand(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}