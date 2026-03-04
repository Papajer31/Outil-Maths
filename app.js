// Moteur minimal (avec mode prof + reprise après refresh)

const PIN = "1234"; // MVP : change quand tu veux
const STORAGE_KEY = "outil-maths-session-v1";

const els = {
  btnConfig: $("#btnConfig"),
  btnStop: $("#btnStop"),
  btnPause: $("#btnPause"),
  btnFullscreen: $("#btnFullscreen"),
  headerTitle: $("#headerTitle"),
  pillStatus: $("#pillStatus"),

  workArea: $("#workArea"),
  overlay: $("#overlay"),
  overlayTitle: $("#overlayTitle"),
  overlayBody: $("#overlayBody"),
  overlayActions: $("#overlayActions"),
  overlayHint: $("#overlayHint"),

  timer: $("#globalTimer"),
  timerBar: $("#timerBar"),
};

let toolsCatalog = [];     // depuis tools.json
let session = [];          // [{id,title,timePerQ,questionCount}]
let currentToolIndex = -1;
let currentQuestionIndex = -1;

let activeTool = null;     // module courant
let questionTimer = null;  // setTimeout
let gaugeRaf = null;       // requestAnimationFrame
let gaugeStart = 0;
let gaugeDurationMs = 0;
let paused = false;

let engineState = "IDLE";  // IDLE | CONFIG | READY | RUNNING | BETWEEN_TOOLS | DONE
let isSessionRunning = false;

boot();

async function boot(){
  toolsCatalog = await fetchJSON("./tools/tools.json");

  els.btnConfig.addEventListener("click", async () => {
    const ok = await askPin();
    if (!ok) return;
    openConfig();
  });

  els.btnPause?.addEventListener("click", () => {
    pauseForInterruption("Pause");
  });

  window.addEventListener("keydown", (e) => {
    const isRefresh = (e.key === "F5") || (e.ctrlKey && e.key.toLowerCase() === "r");
    if (!isRefresh) return;

    if (isSessionRunning){
        e.preventDefault();
        stopQuestionLoop();
        els.timer.classList.add("hidden");

        openOverlay({
        title: "Quitter ?",
        body: `<div class="panel">Une séance est en cours.</div>`,
        actions: [
            { label: "Annuler", primary: false, onClick: () => { closeOverlay(); resumeAfterPause(); } },
            { label: "Retour config", primary: true, onClick: stopToConfig }
        ],
        hint: ""
        });
    }
  });

  updateFullscreenButton();
  document.addEventListener("fullscreenchange", updateFullscreenButton);

  els.btnFullscreen?.addEventListener("click", async () => {
    await enterFullscreen();
  });

  // Avertissement navigateur si on quitte pendant une séance
  window.addEventListener("beforeunload", (e) => {
    if (!isSessionRunning) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // Pause automatique dès que la page n’est plus “active”
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseForInterruption("Pause (onglet masqué)");
  });
  
  window.addEventListener("blur", () => {
    pauseForInterruption("Pause (fenêtre inactive)");
  });

  // Si une séance existe en stockage : proposer reprise
  const saved = loadSavedSession();
  if (saved && saved.session?.length){

    // ✅ gel complet avant l'écran de reprise
    stopQuestionLoop();
    els.timer.classList.add("hidden");
    isSessionRunning = false;
    engineState = "IDLE";
    setStatus("Séance interrompue — reprise possible", "warn");

    openOverlay({
      title: "Séance interrompue",
      body: ``,
      actions: [
        { label: "Annuler", primary: false, onClick: () => { clearSavedSession(); closeOverlay(); openIdleHint(); } },
        { label: "Reprendre", primary: true, onClick: () => resumeFromSaved(saved) }
      ],
      hint: ""
    });
    return;
  }

  openIdleHint();
}

function openIdleHint(){
  engineState = "IDLE";
  isSessionRunning = false;
  setStatus("Prêt", "pill");
  closeOverlay();
  els.timer.classList.add("hidden");
  els.workArea.innerHTML = "";
}

/* =========================
   PIN
   ========================= */

async function askPin(){
  // Pause totale derrière (important sur tablette)
  stopQuestionLoop();
  els.timer.classList.add("hidden");

  return await askPinOverlay();
}

function askPinOverlay(){
  return new Promise((resolve) => {
    let code = "";

    const render = () => {
      const dots = "•".repeat(code.length).padEnd(4, "◦");
      els.overlayTitle.textContent = "";         // overlay minimaliste
      els.overlayHint.textContent = "";          // pas de texte en bas
      els.overlayActions.innerHTML = "";         // boutons dans le body

      els.overlayBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;align-items:center;">
          <div class="panel" style="padding:16px 18px;min-width:220px;text-align:center;">
            <div style="font-weight:1000;font-size:22px;letter-spacing:6px;">${dots}</div>
          </div>

          <div class="pinpad">
            ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="btn pinbtn" data-k="${n}">${n}</button>`).join("")}
            <button class="btn pinbtn" data-k="back">⌫</button>
            <button class="btn pinbtn" data-k="0">0</button>
            <button class="btn primary pinbtn" data-k="ok">OK</button>
          </div>

          <button class="btn" id="pinCancel" style="min-width:220px;">Annuler</button>
        </div>
      `;

      // handlers
      els.overlayBody.querySelectorAll("[data-k]").forEach(b => {
        b.addEventListener("click", () => {
          const k = b.getAttribute("data-k");
          if (k === "back") code = code.slice(0, -1);
          else if (k === "ok") {
            closeOverlay();
            resolve(code === PIN);
            return;
          } else {
            if (code.length < 4) code += k;
            // auto OK si 4 chiffres
            if (code.length === 4){
              closeOverlay();
              resolve(code === PIN);
              return;
            }
          }
          render();
        });
      });

      $("#pinCancel").addEventListener("click", () => {
        closeOverlay();
        resolve(false);
      });
    };

    els.overlay.classList.remove("hidden");
    render();
  });
}

/* =========================
   CONFIG
   ========================= */

function openConfig(){
  engineState = "CONFIG";
  setStatus("Configuration", "warn");

  const rows = toolsCatalog.map(t => configRowHTML(t)).join("");

  openOverlay({
    title: "",   // minimal : pas de titre
    body: `
      <div class="cfg-table">

        <div class="cfg-head">
          <div></div>
          <div>Outil</div>
          <div>Temps/questions (s)</div>
          <div>Questions</div>
        </div>

        ${rows}

      </div>
    `,
    actions: [
      { label: "Annuler", primary: false, onClick: () => { closeOverlay(); openIdleHint(); } },
      { label: "Valider", primary: true, onClick: validateConfig }
    ],
    hint: "" // pas d’aide
  });

  // wiring (grisage)
  toolsCatalog.forEach(t => {
    const chk = $(`#chk_${t.id}`);
    chk.addEventListener("change", () => {
      setRowEnabled(t.id, chk.checked);
    });
    setRowEnabled(t.id, chk.checked);
  });
}

function configRowHTML(t){
  return `
    <div class="cfg-row" id="row_${t.id}">
      <input type="checkbox" id="chk_${t.id}" aria-label="Activer ${escapeHtml(t.title)}">
      <div class="pill cfg-title">${escapeHtml(t.title)}</div>
      <input type="number" min="5" max="999" step="5" value="40" id="time_${t.id}">
      <input type="number" min="1" max="200" step="1" value="10" id="count_${t.id}">
    </div>
  `;
}

function setRowEnabled(id, enabled){
  const row = $(`#row_${id}`);
  const time = $(`#time_${id}`);
  const count = $(`#count_${id}`);

  time.disabled = !enabled;
  count.disabled = !enabled;

  row.classList.toggle("disabled", !enabled);
}

async function validateConfig(){
  session = [];
  for (const t of toolsCatalog){
    const chk = $(`#chk_${t.id}`);
    if (!chk.checked) continue;

    const timePerQ = clampInt($(`#time_${t.id}`).value, 5, 999);
    const questionCount = clampInt($(`#count_${t.id}`).value, 1, 200);

    session.push({
      id: t.id,
      title: t.title,
      timePerQ,
      questionCount
    });
  }

  if (session.length === 0){
    alert("Choisis au moins un outil.");
    return;
  }

  // sauver la config immédiatement (utile si refresh avant démarrage)
  saveSessionSnapshot();

  await enterFullscreen();

  engineState = "READY";
  setStatus("Prêt", "warn");

  openOverlay({
    title: "",
    body: `
        <div style="display:flex;justify-content:center;align-items:center;min-height:220px;">
        <button class="btn primary btn-big" id="btnStartSession">Démarrer</button>
        </div>
    `,
    actions: [],
    hint: ""
  });

  $("#btnStartSession").addEventListener("click", startSession);
}

/* =========================
   SESSION
   ========================= */

async function startSession(){
  closeOverlay();
  currentToolIndex = -1;
  currentQuestionIndex = -1;
  isSessionRunning = true;
  await nextTool(true);
}

async function nextTool(isFirst){
  stopQuestionLoop();

  // démonter l’outil précédent
  if (activeTool?.unmount){
    activeTool.unmount(els.workArea);
  }
  activeTool = null;

  currentToolIndex += 1;
  currentQuestionIndex = -1;

  // fin de session
  if (currentToolIndex >= session.length){
    els.timer.classList.add("hidden");
    engineState = "DONE";
    isSessionRunning = false;
    clearSavedSession();
    setStatus("Session terminée", "good");

    openOverlay({
      title: "Session terminée",
      body: ``,
      actions: [],
      hint: ""
    });
    return;
  }

  const item = session[currentToolIndex];
  setStatus(`${item.title} — prêt`, "warn");
  saveSessionSnapshot();

  // entre deux outils : overlay minimaliste (gros bouton)
  if (!isFirst){
    engineState = "BETWEEN_TOOLS";

    openOverlay({
      title: "",
      body: `
        <div style="display:flex;justify-content:center;align-items:center;min-height:220px;">
          <button class="btn primary btn-big" id="btnNextActivity">Activité suivante</button>
        </div>
      `,
      actions: [],
      hint: ""
    });

    $("#btnNextActivity").addEventListener("click", () => beginTool(item));
    return;
  }

  // 1er outil : on démarre direct
  await beginTool(item);
}

async function beginTool(item){
  closeOverlay();

  // charger module
  const mod = await import(`./tools/${item.id}/tool.js`);
  activeTool = mod.default;

  // monter UI
  activeTool.mount?.(els.workArea);

  // lancer questions
  engineState = "RUNNING";
  els.timer.classList.remove("hidden");

  await nextQuestion(item, true);
}

async function nextQuestion(item, isFirstQuestion){
  stopQuestionLoop();

  currentQuestionIndex += 1;

  if (currentQuestionIndex >= item.questionCount){
    els.timer.classList.add("hidden");
    await nextTool(false);
    return;
  }

  setStatus(`${item.title} (${item.timePerQ} s) — ${currentQuestionIndex + 1}/${item.questionCount}`, "pill");
  saveSessionSnapshot();

  // transition douce (sauf toute 1re question)
  if (!isFirstQuestion){
    engineState = "BETWEEN_TOOLS"; // “pause” courte
    openOverlay({
      title: "Nouvelle question",
      body: `
        <div class="mini-timer" aria-hidden="true">
          <div class="mini-timer-bar" id="miniTimerBar"></div>
        </div>
      `,
      actions: [],
      hint: "",
      opaque: true
    });

    // lance l'anim de jauge (3 s)
    const bar = $("#miniTimerBar");
    if (bar){
      bar.style.animation = "miniDrain 5s linear forwards";
    }

    await waitMs(5000);
    closeOverlay();
    engineState = "RUNNING";
  }

  // demander à l’outil d’afficher la question
  activeTool.nextQuestion?.(els.workArea);

  // lancer chrono + jauge
  startGauge(item.timePerQ * 1000);

  questionTimer = setTimeout(() => {

    // afficher la réponse si l'outil le supporte
    activeTool.showAnswer?.(els.workArea);

    // petite pause pédagogique
    setTimeout(() => {
      nextQuestion(item, false);
    }, 3000);

  }, item.timePerQ * 1000);
}

function stopQuestionLoop(){
  if (questionTimer){
    clearTimeout(questionTimer);
    questionTimer = null;
  }
  stopGauge();
}

/* =========================
   JAUGE
   ========================= */

function startGauge(durationMs){
  stopGauge();
  gaugeStart = performance.now();
  gaugeDurationMs = durationMs;

  const tick = (now) => {
    const t = (now - gaugeStart) / gaugeDurationMs;
    const remaining = Math.max(0, 1 - t);
    els.timerBar.style.transform = `scaleX(${remaining})`;
    if (t < 1){
      gaugeRaf = requestAnimationFrame(tick);
    }
  };

  els.timerBar.style.transform = "scaleX(1)";
  gaugeRaf = requestAnimationFrame(tick);
}

function stopGauge(){
  if (gaugeRaf){
    cancelAnimationFrame(gaugeRaf);
    gaugeRaf = null;
  }
  els.timerBar.style.transform = "scaleX(1)";
}

/* =========================
   STATUS (header)
   ========================= */

function setStatus(text, mood){
  if (!els.pillStatus) return;
  els.pillStatus.textContent = text;

  // reset classes
  els.pillStatus.classList.remove("good","warn","bad");

  if (mood === "good") els.pillStatus.classList.add("good");
  else if (mood === "warn") els.pillStatus.classList.add("warn");
  else if (mood === "bad") els.pillStatus.classList.add("bad");

  setHeaderTitle(text);
}

function setHeaderTitle(text){
  if (!els.headerTitle) return;
  els.headerTitle.textContent = text;
}

function updateFullscreenButton(){
  if (!els.btnFullscreen) return;
  const isFs = !!document.fullscreenElement;
  els.btnFullscreen.style.display = isFs ? "none" : "";
}

async function enterFullscreen(){
  try{
    if (!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    }
  }catch{
    // si refusé (iPad/Safari ou politique navigateur), on ignore en MVP
  }finally{
    updateFullscreenButton();
  }
}

/* =========================
   PERSISTENCE (anti-refresh)
   ========================= */

function saveSessionSnapshot(){
  // On enregistre assez pour reprendre proprement.
  // Note : on ne tente pas de reprendre “au milieu d’une question” à la milliseconde.
  const snap = {
    session,
    currentToolIndex,
    currentQuestionIndex,
    engineState,
    savedAt: Date.now()
  };
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  }catch{
    // si stockage plein / bloqué : on ignore (MVP)
  }
}

function loadSavedSession(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

function clearSavedSession(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch{}
}

async function resumeFromSaved(saved){
  closeOverlay();

  // restaure l’état minimal
  session = saved.session ?? [];
  currentToolIndex = saved.currentToolIndex ?? 0;
  currentQuestionIndex = saved.currentQuestionIndex ?? -1;

  // clamp de sécurité
  if (currentToolIndex < 0) currentToolIndex = 0;
  if (currentToolIndex >= session.length) currentToolIndex = 0;
  if (currentQuestionIndex < -1) currentQuestionIndex = -1;

  // reprise directe (collectif : on repart tout de suite)
  isSessionRunning = true;

  const item = session[currentToolIndex];
  setStatus(`${item.title}`, "warn");

  await remountAndResume(item);
}

async function remountAndResume(item){
  closeOverlay();
  stopQuestionLoop();

  const mod = await import(`./tools/${item.id}/tool.js`);
  activeTool = mod.default;

  activeTool.mount?.(els.workArea);

  // on régénère une question visuellement
  activeTool.nextQuestion?.(els.workArea);

  engineState = "RUNNING";
  els.timer.classList.remove("hidden");

  // redémarre le chrono sans avancer dans l'exercice
  startCurrentQuestion(item, { regenerate: false });
}

function pauseForInterruption(reason){
  if (!isSessionRunning) return;
  if (paused) return;

  paused = true;

  stopQuestionLoop();
  els.timer.classList.add("hidden");

  openOverlay({
    title: "",
    body: `
      <div style="display:flex;justify-content:center;align-items:center;min-height:220px;">
        <button class="btn primary btn-big" id="btnResume">Reprendre</button>
      </div>
    `,
    actions: [],
    hint: ""
  });

  $("#btnResume").addEventListener("click", resumeAfterPause);
}

function resumeAfterPause(){
  closeOverlay();
  paused = false;

  if (!isSessionRunning) return;
  const item = session?.[currentToolIndex];
  if (!item) return;

  // Option A (recommandée) : reprendre exactement le même affichage
  startCurrentQuestion(item, { regenerate: false });

  // Option B : régénérer l’énoncé MAIS sans avancer le compteur
  // startCurrentQuestion(item, { regenerate: true });
}

function startCurrentQuestion(item, { regenerate = false } = {}){
  stopQuestionLoop();

  if (!activeTool || !item) return;

  // Affichage (optionnel) : si regenerate=true, on redemande un énoncé
  if (regenerate){
    activeTool.nextQuestion?.(els.workArea);
  }

  // Relance jauge + timer SANS changer l’index
  engineState = "RUNNING";
  els.timer.classList.remove("hidden");

  startGauge(item.timePerQ * 1000);

  questionTimer = setTimeout(() => {
    nextQuestion(item, false); // là, oui, on avance
  }, item.timePerQ * 1000);

  // Met à jour la pill (si tu veux)
  setStatus(`${item.title} — Q ${currentQuestionIndex + 1}/${item.questionCount} — ${item.timePerQ}s`, "pill");
  saveSessionSnapshot();
}

/* =========================
   OVERLAY helper
   ========================= */

function openOverlay({title, body, actions, hint, opaque = false}){
  els.overlayTitle.textContent = title ?? "";
  els.overlayBody.innerHTML = body ?? "";
  els.overlayHint.textContent = hint ?? "";

  els.overlayActions.innerHTML = "";
  for (const a of (actions ?? [])){
    const btn = document.createElement("button");
    btn.className = `btn ${a.primary ? "primary" : ""}`.trim();
    btn.textContent = a.label;
    btn.addEventListener("click", a.onClick);
    els.overlayActions.appendChild(btn);
  }

  els.overlay.classList.toggle("opaque", !!opaque);   // ✅
  els.overlay.classList.remove("hidden");
}

function closeOverlay(){
  els.overlay.classList.add("hidden");
  els.overlay.classList.remove("opaque");            // ✅
  els.overlayActions.innerHTML = "";
}

/* =========================
   Utils
   ========================= */

function $(sel){ return document.querySelector(sel); }

async function fetchJSON(path){
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`Impossible de charger ${path} (${r.status})`);
  return await r.json();
}

function clampInt(v, min, max){
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function waitMs(ms){
  return new Promise(res => setTimeout(res, ms));
}