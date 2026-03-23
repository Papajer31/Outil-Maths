import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderCheckbox,
  readCheckbox
} from "../../toolVariables.js";

let currentQuestion = {
  n: 10,
  character: "picbille",
  questionSrc: "",
  answerSrc: ""
};

const ASSET_BASE = "./modules/maths/tools/ReprésentationDécimale";

// cache de préchargement
const preloadCache = new Map();

export default {
  getDefaultSettings(){
    return {
      min: 10,
      max: 69,
      usePicbille: true,
      useDede: true
    };
  },

  renderToolSettings(container, settings){
    const s = {
      ...this.getDefaultSettings(),
      ...(settings ?? {})
    };

    container.innerHTML = `
      ${renderMinMax({
        idPrefix: "rd_range",
        title: "Nombres",
        minValue: s.min,
        maxValue: s.max,
        inputMin: 1,
        inputMax: 69,
        errorLabel: "Les bornes"
      })}

      <div class="tv-group">
        <div class="tv-group-title">Représentations</div>
        <div class="tv-stack">
          ${renderCheckbox({
            id: "rd_use_picbille",
            label: "Utiliser Picbille",
            checked: !!s.usePicbille
          })}
          ${renderCheckbox({
            id: "rd_use_dede",
            label: "Utiliser Dédé",
            checked: !!s.useDede
          })}
        </div>
      </div>
    `;

    bindMinMax(container, "rd_range", {
      inputMin: 1,
      inputMax: 69
    });
  },

  readToolSettings(container){
    const { min, max } = readMinMax(container, "rd_range", {
      inputMin: 1,
      inputMax: 69,
      errorLabel: "Les bornes"
    });

    const usePicbille = readCheckbox(container, "rd_use_picbille");
    const useDede = readCheckbox(container, "rd_use_dede");

    if (!usePicbille && !useDede){
      throw new Error("Active au moins une représentation : Picbille ou Dédé.");
    }

    return {
      min,
      max,
      usePicbille,
      useDede
    };
  },

  mount(container){
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
  },

  nextQuestion(container, ctx){
    const settings = normalizeSettings(ctx?.settings);

    const availableCharacters = [];
    if (settings.usePicbille) availableCharacters.push("picbille");
    if (settings.useDede) availableCharacters.push("dede");

    if (availableCharacters.length === 0){
      throw new Error("Aucune représentation active pour ReprésentationDécimale.");
    }

    const n = rand(settings.min, settings.max);
    const character = pickRandom(availableCharacters);



    const questionSrc = `${ASSET_BASE}/${character}.png`;
    const answerSrc = `${ASSET_BASE}/graphs/${character}/${n}.png`;

    currentQuestion = {
      n,
      character,
      questionSrc,
      answerSrc
    };

    const numberEl = container.querySelector("#rd_number");
    const img = container.querySelector("#rd_img");
    const frame = container.querySelector("#rd_answer_frame");

    if (!numberEl || !img || !frame) return;

    numberEl.textContent = String(n);

    // mode question : personnage seul, plus petit, sans cadre visible
    frame.style.borderColor = "transparent";
    frame.style.background = "transparent";
    frame.style.padding = "0";

    img.style.width = "70%";
    img.style.height = "70%";
    img.style.objectFit = "contain";

    setImageWhenReady(img, questionSrc);
    preloadImage(answerSrc);
  },

  showAnswer(container){
    const img = container.querySelector("#rd_img");
    const frame = container.querySelector("#rd_answer_frame");
    if (!img || !frame) return;

    // mode réponse : image complète dans un cadre
    frame.style.borderColor = "var(--border, #2b3142)";
    frame.style.background = "var(--panel, #171a21)";
    frame.style.padding = "18px";

    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";

    setImageWhenReady(img, currentQuestion.answerSrc);
  },

  unmount(container){
    container.innerHTML = "";
  }
};

function normalizeSettings(settings){
  const defaults = {
    min: 10,
    max: 69,
    usePicbille: true,
    useDede: true
  };

  const s = {
    ...defaults,
    ...(settings ?? {})
  };

  const min = clampInt(s.min, 1, 69);
  const max = clampInt(s.max, 1, 69);

  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    usePicbille: !!s.usePicbille,
    useDede: !!s.useDede
  };
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

function pickRandom(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

function clampInt(v, min, max){
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}