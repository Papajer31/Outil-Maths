import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  clampInt
} from "../toolVariables.js";

let n1 = 5;
let n2 = 0;
let r = 5;

export default {
  getDefaultSettings(){
    return {
      n1Min: 5,
      n1Max: 10,
      n2Min: 0,
      n2Max: 10,
      resultMin: 0,
      resultMax: 10
    };
  },

  renderToolSettings(container, settings){
    const cfg = normalizeSettings(settings);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${renderMinMax({
          idPrefix: "ps_n1",
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
          idPrefix: "ps_n2",
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
          idPrefix: "ps_result",
          title: "Résultat",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.resultMin,
          maxValue: cfg.resultMax,
          inputMin: 0,
          inputMax: 99,
          step: 1
        })}
      </div>
    `;

    bindMinMax(container, "ps_n1", {
      inputMin: 0,
      inputMax: 99
    });

    bindMinMax(container, "ps_n2", {
      inputMin: 0,
      inputMax: 99
    });

    bindMinMax(container, "ps_result", {
      inputMin: 0,
      inputMax: 99
    });

    const n1MinEl = container.querySelector("#ps_n1_min");
    const n1MaxEl = container.querySelector("#ps_n1_max");
    const n2MinEl = container.querySelector("#ps_n2_min");
    const n2MaxEl = container.querySelector("#ps_n2_max");
    const resultMinEl = container.querySelector("#ps_result_min");
    const resultMaxEl = container.querySelector("#ps_result_max");

    const syncSpecific = () => {
      const currentN1Max = clampInt(n1MaxEl?.value, 0, 99);

      if (n2MinEl) n2MinEl.max = String(currentN1Max);
      if (n2MaxEl) n2MaxEl.max = String(currentN1Max);
      if (resultMinEl) resultMinEl.max = String(currentN1Max);
      if (resultMaxEl) resultMaxEl.max = String(currentN1Max);

      if (n2MinEl) n2MinEl.value = String(clampInt(n2MinEl.value, 0, currentN1Max));
      if (n2MaxEl) n2MaxEl.value = String(clampInt(n2MaxEl.value, 0, currentN1Max));
      if (resultMinEl) resultMinEl.value = String(clampInt(resultMinEl.value, 0, currentN1Max));
      if (resultMaxEl) resultMaxEl.value = String(clampInt(resultMaxEl.value, 0, currentN1Max));

      if (Number(n2MinEl.value) > Number(n2MaxEl.value)){
        n2MinEl.value = n2MaxEl.value;
      }

      if (Number(resultMinEl.value) > Number(resultMaxEl.value)){
        resultMinEl.value = resultMaxEl.value;
      }

      if (Number(n1MinEl.value) > Number(n1MaxEl.value)){
        n1MinEl.value = n1MaxEl.value;
      }
    };

    [
      n1MinEl, n1MaxEl,
      n2MinEl, n2MaxEl,
      resultMinEl, resultMaxEl
    ].forEach(el => {
      el?.addEventListener("input", syncSpecific);
      el?.addEventListener("change", syncSpecific);
    });

    syncSpecific();
  },

  readToolSettings(container){
    const n1Range = readMinMax(container, "ps_n1", {
      inputMin: 0,
      inputMax: 99,
      errorLabel: "Les bornes du premier terme"
    });

    const n2Range = readMinMax(container, "ps_n2", {
      inputMin: 0,
      inputMax: 99,
      errorLabel: "Les bornes du deuxième terme"
    });

    const resultRange = readMinMax(container, "ps_result", {
      inputMin: 0,
      inputMax: 99,
      errorLabel: "Les bornes du résultat"
    });

    if (n2Range.min > n1Range.max){
      throw new Error("Le minimum du deuxième terme ne peut pas dépasser le maximum du premier terme.");
    }

    if (resultRange.max > n1Range.max){
      throw new Error("Le maximum du résultat ne peut pas dépasser le maximum du premier terme.");
    }

    let possible = false;

    for (let a = n1Range.min; a <= n1Range.max; a++){
      const bMin = Math.max(n2Range.min, 0);
      const bMax = Math.min(n2Range.max, a);

      for (let b = bMin; b <= bMax; b++){
        const diff = a - b;
        if (diff >= resultRange.min && diff <= resultRange.max){
          possible = true;
          break;
        }
      }

      if (possible) break;
    }

    if (!possible){
      throw new Error("Aucune soustraction possible avec ces réglages.");
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
        <div class="tool-big" id="ps_expr"></div>
      </div>
    `;
  },

  nextQuestion(container, ctx){
    const settings = normalizeSettings(ctx?.settings);

    let found = false;

    for (let i = 0; i < 500; i++){
      const a = rand(settings.n1Min, settings.n1Max);
      const bMin = Math.max(settings.n2Min, 0);
      const bMax = Math.min(settings.n2Max, a);

      if (bMin > bMax) continue;

      const b = rand(bMin, bMax);
      const diff = a - b;

      if (diff < settings.resultMin || diff > settings.resultMax) continue;

      n1 = a;
      n2 = b;
      r = diff;
      found = true;
      break;
    }

    if (!found){
      outer:
      for (let a = settings.n1Min; a <= settings.n1Max; a++){
        const bMin = Math.max(settings.n2Min, 0);
        const bMax = Math.min(settings.n2Max, a);

        for (let b = bMin; b <= bMax; b++){
          const diff = a - b;
          if (diff < settings.resultMin || diff > settings.resultMax) continue;

          n1 = a;
          n2 = b;
          r = diff;
          found = true;
          break outer;
        }
      }
    }

    container.querySelector("#ps_expr").textContent = `${n1} − ${n2}`;
  },

  showAnswer(container, ctx){
    container.querySelector("#ps_expr").textContent = `${n1} − ${n2} = ${r}`;
  },

  unmount(container){
    container.innerHTML = "";
    n1 = 5;
    n2 = 0;
    r = 5;
  }
};

function normalizeSettings(settings){
  const base = {
    n1Min: 5,
    n1Max: 10,
    n2Min: 0,
    n2Max: 10,
    resultMin: 0,
    resultMax: 10,
    ...(settings ?? {})
  };

  base.n1Min = clampInt(base.n1Min, 0, 99);
  base.n1Max = clampInt(base.n1Max, 0, 99);
  base.n2Min = clampInt(base.n2Min, 0, 99);
  base.n2Max = clampInt(base.n2Max, 0, 99);
  base.resultMin = clampInt(base.resultMin, 0, 99);
  base.resultMax = clampInt(base.resultMax, 0, 99);

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

  base.n2Min = Math.min(base.n2Min, base.n1Max);
  base.n2Max = Math.min(base.n2Max, base.n1Max);
  base.resultMin = Math.min(base.resultMin, base.n1Max);
  base.resultMax = Math.min(base.resultMax, base.n1Max);

  if (base.n2Min > base.n2Max){
    base.n2Min = base.n2Max;
  }

  if (base.resultMin > base.resultMax){
    base.resultMin = base.resultMax;
  }

  return base;
}

function rand(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}