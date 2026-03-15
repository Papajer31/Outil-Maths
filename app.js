const PIN = "1206";
const STORAGE_KEY = "outil-maths-session-v1";

const DEFAULT_TOOL_ROW = Object.freeze({
  enabled: false,
  timePerQ: 40,
  questionCount: 10,
  answerTime: 5,
  settings: null
});

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

  toolOverlay: $("#toolOverlay"),
  toolOverlayTitle: $("#toolOverlayTitle"),
  toolOverlayBody: $("#toolOverlayBody"),
  toolOverlayActions: $("#toolOverlayActions"),
  toolOverlayHint: $("#toolOverlayHint"),

  timer: $("#globalTimer"),
  timerBar: $("#timerBar"),
};

let toolsCatalog = [];
let session = [];
let currentToolIndex = -1;
let currentQuestionIndex = -1;

let activeTool = null;
let questionTimer = null;
let answerTimer = null;
let gaugeRaf = null;
let gaugeStart = 0;
let gaugeDurationMs = 0;
let paused = false;

let engineState = "IDLE";
let isSessionRunning = false;

const toolModuleCache = new Map();
const configDrafts = new Map();
let currentToolSettingsEditor = null;

boot();

async function boot(){
  toolsCatalog = await fetchJSON("./tools/tools.json");
  ensureConfigDrafts();

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

  window.addEventListener("beforeunload", (e) => {
    if (!isSessionRunning) return;
    e.preventDefault();
    e.returnValue = "";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseForInterruption("Pause (onglet masqué)");
  });

  window.addEventListener("blur", () => {
    pauseForInterruption("Pause (fenêtre inactive)");
  });

  const saved = loadSavedSession();
  if (saved && saved.session?.length){
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
  closeToolOverlay();
  els.timer.classList.add("hidden");
  els.workArea.innerHTML = "";
}

/* =========================
   PIN
   ========================= */

async function askPin(){
  stopQuestionLoop();
  els.timer.classList.add("hidden");
  return await askPinOverlay();
}

function askPinOverlay(){
  return new Promise((resolve) => {
    let code = "";

    const render = () => {
      const dots = "•".repeat(code.length).padEnd(4, "◦");
      els.overlayTitle.textContent = "";
      els.overlayHint.textContent = "";
      els.overlayActions.innerHTML = "";

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

function ensureConfigDrafts(){
  for (const t of toolsCatalog){
    if (!configDrafts.has(t.id)){
      configDrafts.set(t.id, {
        enabled: DEFAULT_TOOL_ROW.enabled,
        timePerQ: DEFAULT_TOOL_ROW.timePerQ,
        questionCount: DEFAULT_TOOL_ROW.questionCount,
        answerTime: DEFAULT_TOOL_ROW.answerTime,
        settings: null
      });
    }
  }
}

function getToolDraft(id){
  if (!configDrafts.has(id)){
    configDrafts.set(id, {
      enabled: DEFAULT_TOOL_ROW.enabled,
      timePerQ: DEFAULT_TOOL_ROW.timePerQ,
      questionCount: DEFAULT_TOOL_ROW.questionCount,
      answerTime: DEFAULT_TOOL_ROW.answerTime,
      settings: null
    });
  }
  return configDrafts.get(id);
}

function openConfig(){
  engineState = "CONFIG";
  setStatus("Configuration", "warn");
  ensureConfigDrafts();

  const rows = toolsCatalog.map(t => configRowHTML(t)).join("");
  els.overlay.classList.add("is-config");

  openOverlay({
    title: "",
    body: `
      <div class="cfg-table">
        <div class="cfg-head">
          <div></div>
          <div>Outil</div>
          <div>Temps (s)</div>
          <div>Questions</div>
          <div>Réponse (s)</div>
          <div></div>
        </div>
        ${rows}
      </div>
    `,
    actions: [
      { label: "Annuler", primary: false, onClick: () => { closeOverlay(); openIdleHint(); } },
      { label: "Valider", primary: true, onClick: validateConfig }
    ],
    hint: `<div class="cfg-estimate-inline" id="cfgEstimate">Durée estimée : <strong>0 min</strong></div>`
  });

  toolsCatalog.forEach(t => {
    const draft = getToolDraft(t.id);
    const chk = $(`#chk_${t.id}`);
    const time = $(`#time_${t.id}`);
    const count = $(`#count_${t.id}`);
    const answer = $(`#answer_${t.id}`);
    const btnSettings = $(`#settings_${t.id}`);

    chk.checked = !!draft.enabled;
    time.value = draft.timePerQ;
    count.value = draft.questionCount;
    answer.value = draft.answerTime;

    chk.addEventListener("change", () => {
      draft.enabled = chk.checked;
      setRowEnabled(t.id, chk.checked);
      updateConfigEstimate();
    });

    time.addEventListener("input", () => {
      draft.timePerQ = clampInt(time.value, 5, 999);
      updateConfigEstimate();
    });
    time.addEventListener("change", () => {
      time.value = clampInt(time.value, 5, 999);
      draft.timePerQ = Number(time.value);
      updateConfigEstimate();
    });

    count.addEventListener("input", () => {
      draft.questionCount = clampInt(count.value, 1, 200);
      updateConfigEstimate();
    });
    count.addEventListener("change", () => {
      count.value = clampInt(count.value, 1, 200);
      draft.questionCount = Number(count.value);
      updateConfigEstimate();
    });

    answer.addEventListener("input", () => {
      draft.answerTime = clampInt(answer.value, 1, 30);
      updateConfigEstimate();
    });
    answer.addEventListener("change", () => {
      answer.value = clampInt(answer.value, 1, 30);
      draft.answerTime = Number(answer.value);
      updateConfigEstimate();
    });

    btnSettings?.addEventListener("click", () => {
      openToolSettings(t.id);
    });

    setRowEnabled(t.id, chk.checked);
  });

  els.overlayBody.querySelectorAll('input[type="number"]').forEach((inp) => {
    inp.addEventListener("focus", () => {
      inp.select?.();
      try { inp.setSelectionRange(0, inp.value.length); } catch {}
    });

    inp.addEventListener("pointerup", () => {
      inp.select?.();
      try { inp.setSelectionRange(0, inp.value.length); } catch {}
    });
  });

  updateConfigEstimate();
}

function configRowHTML(t){
  return `
    <div class="cfg-row" id="row_${t.id}">
      <input type="checkbox" id="chk_${t.id}" aria-label="Activer ${escapeHtml(t.title)}">
      <div class="pill cfg-title">${escapeHtml(t.title)}</div>
      <input type="number" min="5" max="999" step="5" id="time_${t.id}">
      <input type="number" min="1" max="200" step="1" id="count_${t.id}">
      <input type="number" min="1" max="30" step="1" id="answer_${t.id}">
      <button class="btn btn-icon cfg-gear" type="button" id="settings_${t.id}" aria-label="Réglages ${escapeHtml(t.title)}">⚙️</button>
    </div>
  `;
}

function setRowEnabled(id, enabled){
  const row = $(`#row_${id}`);
  const time = $(`#time_${id}`);
  const count = $(`#count_${id}`);
  const answer = $(`#answer_${id}`);

  time.disabled = !enabled;
  count.disabled = !enabled;
  answer.disabled = !enabled;

  row.classList.toggle("disabled", !enabled);
}

async function openToolSettings(toolId){
  const toolMeta = toolsCatalog.find(t => t.id === toolId);
  if (!toolMeta) return;

  const draft = getToolDraft(toolId);
  const mod = await loadToolModule(toolId);
  const tool = mod.default ?? {};

  if (draft.settings == null){
    draft.settings = getToolDefaultSettings(tool);
  }

  currentToolSettingsEditor = { toolId, tool };

  openToolOverlay({
    title: toolMeta.title,
    body: `<div id="toolSettingsHost"></div>`,
    actions: [
      { label: "Annuler", primary: false, onClick: closeToolOverlay },
      { label: "Valider", primary: true, onClick: validateToolSettings }
    ],
    hint: ""
  });

  const host = $("#toolSettingsHost");
  if (!host) return;

  if (typeof tool.renderToolSettings === "function"){
    tool.renderToolSettings(host, cloneData(draft.settings));
  } else {
    host.innerHTML = `<div class="panel">Aucun réglage spécifique pour cet outil.</div>`;
  }

  host.querySelectorAll('input[type="number"]').forEach((inp) => {
    inp.addEventListener("focus", () => {
      inp.select?.();
      try { inp.setSelectionRange(0, inp.value.length); } catch {}
    });

    inp.addEventListener("pointerup", () => {
      inp.select?.();
      try { inp.setSelectionRange(0, inp.value.length); } catch {}
    });
  });
}

function validateToolSettings(){
  if (!currentToolSettingsEditor) return;

  const { toolId, tool } = currentToolSettingsEditor;
  const draft = getToolDraft(toolId);
  const host = $("#toolSettingsHost");
  if (!host) return;

  try {
    if (typeof tool.readToolSettings === "function"){
      draft.settings = tool.readToolSettings(host);
    } else if (draft.settings == null) {
      draft.settings = getToolDefaultSettings(tool);
    }

    closeToolOverlay();
  } catch (err) {
    alert(err?.message || "Réglages invalides.");
  }
}

async function validateConfig(){
  session = [];

  for (const t of toolsCatalog){
    const draft = getToolDraft(t.id);
    const chk = $(`#chk_${t.id}`);
    if (!chk?.checked) continue;

    const mod = await loadToolModule(t.id);
    const tool = mod.default ?? {};

    const timePerQ = clampInt($(`#time_${t.id}`).value, 5, 999);
    const questionCount = clampInt($(`#count_${t.id}`).value, 1, 200);
    const answerTime = clampInt($(`#answer_${t.id}`).value, 1, 30);
    const settings = draft.settings == null
      ? getToolDefaultSettings(tool)
      : cloneData(draft.settings);

    draft.enabled = true;
    draft.timePerQ = timePerQ;
    draft.questionCount = questionCount;
    draft.answerTime = answerTime;
    draft.settings = cloneData(settings);

    session.push({
      id: t.id,
      title: t.title,
      timePerQ,
      questionCount,
      answerTime,
      settings
    });
  }

  if (session.length === 0){
    alert("Choisis au moins un outil.");
    return;
  }

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

function updateConfigEstimate(){
  const estimateEl = $("#cfgEstimate");
  if (!estimateEl) return;

  let totalSeconds = 0;
  let enabledTools = 0;

  for (const t of toolsCatalog){
    const chk = $(`#chk_${t.id}`);
    if (!chk?.checked) continue;

    enabledTools += 1;

    const timePerQ = clampInt($(`#time_${t.id}`)?.value, 5, 999);
    const questionCount = clampInt($(`#count_${t.id}`)?.value, 1, 200);
    const answerTime = clampInt($(`#answer_${t.id}`)?.value, 1, 30);

    totalSeconds += estimateToolSeconds({
      timePerQ,
      questionCount,
      answerTime
    });
  }

  if (enabledTools > 1){
    totalSeconds += (enabledTools - 1) * 10;
  }

  estimateEl.innerHTML = `Durée estimée : <strong>${formatDuration(totalSeconds)}</strong>`;
}

function estimateToolSeconds({ timePerQ, questionCount, answerTime }){
  const q = questionCount;
  const questionSeconds = q * timePerQ;
  const answerSeconds = q * answerTime;
  const miniTransitionSeconds = Math.max(0, q - 1) * 5;

  return questionSeconds + answerSeconds + miniTransitionSeconds;
}

function formatDuration(totalSeconds){
  const minutes = Math.ceil(totalSeconds / 60);

  if (minutes >= 60){
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} h ${m} min`;
  }

  return `${minutes} min`;
}

/* =========================
   SESSION
   ========================= */

async function startSession(){
  closeOverlay();
  closeToolOverlay();
  currentToolIndex = -1;
  currentQuestionIndex = -1;
  isSessionRunning = true;
  await nextTool(true);
}

async function nextTool(isFirst){
  stopQuestionLoop();

  if (activeTool?.unmount){
    activeTool.unmount(els.workArea, getToolContext(session[currentToolIndex]));
  }
  activeTool = null;

  currentToolIndex += 1;
  currentQuestionIndex = -1;

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

  await beginTool(item);
}

async function beginTool(item){
  closeOverlay();
  closeToolOverlay();

  const mod = await loadToolModule(item.id);
  activeTool = mod.default;

  const ctx = getToolContext(item);
  activeTool.mount?.(els.workArea, ctx);

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

  if (!isFirstQuestion){
    engineState = "BETWEEN_TOOLS";
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

    const bar = $("#miniTimerBar");
    if (bar){
      bar.style.animation = "miniDrain 5s linear forwards";
    }

    await waitMs(5000);
    closeOverlay();
    engineState = "RUNNING";
  }

  const ctx = getToolContext(item);
  activeTool.nextQuestion?.(els.workArea, ctx);

  startGauge(item.timePerQ * 1000);

  questionTimer = setTimeout(() => {
    const showCtx = getToolContext(item);
    activeTool.showAnswer?.(els.workArea, showCtx);

    answerTimer = setTimeout(() => {
      answerTimer = null;
      nextQuestion(item, false);
    }, item.answerTime * 1000);
  }, item.timePerQ * 1000);
}

function stopQuestionLoop(){
  if (questionTimer){
    clearTimeout(questionTimer);
    questionTimer = null;
  }
  if (answerTimer){
    clearTimeout(answerTimer);
    answerTimer = null;
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
   STATUS
   ========================= */

function setStatus(text, mood){
  if (!els.pillStatus) return;
  els.pillStatus.textContent = text;

  els.pillStatus.classList.remove("good", "warn", "bad");

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
  }finally{
    updateFullscreenButton();
  }
}

/* =========================
   PERSISTENCE
   ========================= */

function saveSessionSnapshot(){
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
  closeToolOverlay();

  session = saved.session ?? [];
  currentToolIndex = saved.currentToolIndex ?? 0;
  currentQuestionIndex = saved.currentQuestionIndex ?? -1;

  if (currentToolIndex < 0) currentToolIndex = 0;
  if (currentToolIndex >= session.length) currentToolIndex = 0;
  if (currentQuestionIndex < -1) currentQuestionIndex = -1;

  isSessionRunning = true;

  const item = session[currentToolIndex];
  setStatus(`${item.title}`, "warn");

  await remountAndResume(item);
}

async function remountAndResume(item){
  closeOverlay();
  closeToolOverlay();
  stopQuestionLoop();

  const mod = await loadToolModule(item.id);
  activeTool = mod.default;

  const ctx = getToolContext(item);
  activeTool.mount?.(els.workArea, ctx);
  activeTool.nextQuestion?.(els.workArea, ctx);

  engineState = "RUNNING";
  els.timer.classList.remove("hidden");

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

  startCurrentQuestion(item, { regenerate: false });
}

function startCurrentQuestion(item, { regenerate = false } = {}){
  stopQuestionLoop();

  if (!activeTool || !item) return;

  const ctx = getToolContext(item);

  if (regenerate){
    activeTool.nextQuestion?.(els.workArea, ctx);
  }

  engineState = "RUNNING";
  els.timer.classList.remove("hidden");

  startGauge(item.timePerQ * 1000);

  questionTimer = setTimeout(() => {
    const showCtx = getToolContext(item);
    activeTool.showAnswer?.(els.workArea, showCtx);

    answerTimer = setTimeout(() => {
      answerTimer = null;
      nextQuestion(item, false);
    }, item.answerTime * 1000);
  }, item.timePerQ * 1000);

  setStatus(`${item.title} — Q ${currentQuestionIndex + 1}/${item.questionCount} — ${item.timePerQ}s`, "pill");
  saveSessionSnapshot();
}

function stopToConfig(){
  stopQuestionLoop();
  isSessionRunning = false;
  paused = false;
  activeTool = null;
  closeToolOverlay();
  openConfig();
}

/* =========================
   OVERLAY HELPERS
   ========================= */

function openOverlay({ title, body, actions, hint, opaque = false }){
  els.overlay.classList.remove("is-config");
  els.overlayTitle.textContent = title ?? "";
  els.overlayBody.innerHTML = body ?? "";
  els.overlayHint.innerHTML = hint ?? "";

  els.overlayActions.innerHTML = "";
  for (const a of (actions ?? [])){
    const btn = document.createElement("button");
    btn.className = `btn ${a.primary ? "primary" : ""}`.trim();
    btn.textContent = a.label;
    btn.addEventListener("click", a.onClick);
    els.overlayActions.appendChild(btn);
  }

  els.overlay.classList.toggle("opaque", !!opaque);
  els.overlay.classList.remove("hidden");
}

function closeOverlay(){
  els.overlay.classList.add("hidden");
  els.overlay.classList.remove("opaque");
  els.overlay.classList.remove("is-config");
  els.overlayActions.innerHTML = "";
}

function openToolOverlay({ title, body, actions, hint }){
  els.toolOverlayTitle.textContent = title ?? "";
  els.toolOverlayBody.innerHTML = body ?? "";
  els.toolOverlayHint.innerHTML = hint ?? "";

  els.toolOverlayActions.innerHTML = "";
  for (const a of (actions ?? [])){
    const btn = document.createElement("button");
    btn.className = `btn ${a.primary ? "primary" : ""}`.trim();
    btn.textContent = a.label;
    btn.addEventListener("click", a.onClick);
    els.toolOverlayActions.appendChild(btn);
  }

  els.toolOverlay.classList.remove("hidden");
}

function closeToolOverlay(){
  els.toolOverlay.classList.add("hidden");
  els.toolOverlayActions.innerHTML = "";
  els.toolOverlayBody.innerHTML = "";
  els.toolOverlayHint.innerHTML = "";
  currentToolSettingsEditor = null;
}

/* =========================
   PLUGINS / OUTILS
   ========================= */

async function loadToolModule(toolId){
  if (!toolModuleCache.has(toolId)){
    toolModuleCache.set(toolId, import(`./tools/${toolId}/tool.js`));
  }
  return await toolModuleCache.get(toolId);
}

function getToolDefaultSettings(tool){
  if (typeof tool?.getDefaultSettings === "function"){
    return cloneData(tool.getDefaultSettings());
  }
  return {};
}

function getToolContext(item){
  if (!item) return { sessionItem: null, settings: {} };
  return {
    sessionItem: item,
    settings: item.settings ?? {}
  };
}

function cloneData(value){
  if (typeof structuredClone === "function"){
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/* =========================
   UTILS
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