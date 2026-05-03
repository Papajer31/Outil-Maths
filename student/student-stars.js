const starMarkupCache = new Map();
const STARFIELD_ROUTES = new Set(["home", "selectmode", "selectstudents", "sessionchoice", "activities", "sessionstart"]);
let persistentStarfieldHost = null;
let persistentStarfieldCleanup = null;

export const STUDENT_STARFIELD_SETTINGS = {
  respectReducedMotion: false
};

export const STUDENT_STARFIELD_PRESETS = Object.freeze({
  global: Object.freeze({
    count: [26, 38],
    size: [2, 8],
    x: [3, 97],
    y: [6, 94],
    driftSpeed: [12, 26],
    respawnOffset: [2, 10]
  }),
  home: Object.freeze({
    count: [18, 30],
    size: [2, 8],
    x: [4, 96],
    y: [8, 92],
    driftSpeed: [10, 22],
    respawnOffset: [2, 10]
  }),
  activities: Object.freeze({
    count: [26, 40],
    size: [2, 8],
    x: [3, 97],
    y: [6, 94],
    driftSpeed: [12, 26],
    respawnOffset: [2, 10]
  }),
  sessionstart: Object.freeze({
    count: [20, 32],
    size: [2, 9],
    x: [5, 95],
    y: [10, 90],
    driftSpeed: [24, 48],
    respawnOffset: [2, 10]
  })
});

const DEFAULT_PRESET = Object.freeze({
  count: [20, 32],
  size: [2, 8],
  x: [4, 96],
  y: [8, 92]
});

export function renderStudentStars(presetName){
  if (starMarkupCache.has(presetName)) {
    return starMarkupCache.get(presetName);
  }

  const preset = STUDENT_STARFIELD_PRESETS[presetName] || DEFAULT_PRESET;
  const count = randomInt(...preset.count);
  const stars = Array.from({ length: count }, () => renderStar(preset)).join("");
  const markup = `<div class="student-stars-layer" aria-hidden="true">${stars}</div>`;
  starMarkupCache.set(presetName, markup);
  return markup;
}

export function resetStudentStarsCache(){
  starMarkupCache.clear();
}

export function mountPersistentStudentStarfield(){
  if (persistentStarfieldHost?.isConnected) {
    return persistentStarfieldHost;
  }

  const host = document.createElement("div");
  host.className = "student-global-stars is-hidden";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = renderStudentStars("global");
  document.body.appendChild(host);

  persistentStarfieldHost = host;
  persistentStarfieldCleanup = mountStudentStarDrift(host, "global");
  return host;
}

export function syncPersistentStudentStarfield(routeName){
  mountPersistentStudentStarfield();
  const safeRouteName = String(routeName || "").trim();
  const shouldShow = STARFIELD_ROUTES.has(safeRouteName);
  persistentStarfieldHost?.classList.toggle("is-hidden", !shouldShow);
}

export function mountStudentStarDrift(host, presetName){
  const layer = host?.querySelector?.(".student-stars-layer");
  if (!layer) return () => {};

  const preset = STUDENT_STARFIELD_PRESETS[presetName] || DEFAULT_PRESET;
  if (!Array.isArray(preset.driftSpeed)) return () => {};

  if (STUDENT_STARFIELD_SETTINGS.respectReducedMotion) {
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
        return () => {};
      }
    } catch {}
  }

  const starNodes = Array.from(layer.querySelectorAll(".student-stars-star"));
  if (!starNodes.length) return () => {};

  let disposed = false;
  let frameId = 0;
  let lastTimestamp = 0;
  let layerWidth = 0;
  let layerHeight = 0;

  const stars = starNodes.map((node) => ({
    node,
    x: 0,
    y: 0,
    size: 0,
    speed: 0
  }));

  measureLayer();
  initStars();
  frameId = window.requestAnimationFrame(tick);
  window.addEventListener("resize", handleResize);

  return cleanup;

  function cleanup(){
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame(frameId);
    window.removeEventListener("resize", handleResize);
  }

  function handleResize(){
    measureLayer();
    stars.forEach((star) => {
      star.x = clamp(star.x, -star.size, layerWidth + star.size);
      star.y = clamp(star.y, 0, layerHeight);
      applyStar(star);
    });
  }

  function tick(timestamp){
    if (disposed) return;

    if (!lastTimestamp) {
      lastTimestamp = timestamp;
    }

    const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
    lastTimestamp = timestamp;

    for (const star of stars) {
      star.x -= star.speed * deltaSeconds;
      if (star.x < -star.size) {
        respawnStar(star);
      }
      applyStar(star);
    }

    frameId = window.requestAnimationFrame(tick);
  }

  function initStars(){
    for (const star of stars) {
      star.size = parseFloat(star.node.dataset.starSize || "") || randomFloat(...preset.size);
      star.speed = randomFloat(...preset.driftSpeed);
      star.x = layerWidth * ((parseFloat(star.node.dataset.starLeft || "") || randomFloat(...preset.x)) / 100);
      star.y = layerHeight * ((parseFloat(star.node.dataset.starTop || "") || randomFloat(...preset.y)) / 100);
      applyStar(star);
    }
  }

  function respawnStar(star){
    star.size = randomFloat(...preset.size);
    star.speed = randomFloat(...preset.driftSpeed);
    star.x = layerWidth * ((100 + randomFloat(...preset.respawnOffset)) / 100);
    star.y = layerHeight * (randomFloat(...preset.y) / 100);
  }

  function applyStar(star){
    star.node.style.left = "0";
    star.node.style.top = "0";
    star.node.style.width = `${formatNumber(star.size)}px`;
    star.node.style.height = `${formatNumber(star.size)}px`;
    star.node.style.transform = `translate3d(${formatNumber(star.x - (star.size / 2))}px, ${formatNumber(star.y - (star.size / 2))}px, 0)`;
  }

  function measureLayer(){
    const rect = layer.getBoundingClientRect();
    layerWidth = Math.max(rect.width || host.clientWidth || window.innerWidth, 1);
    layerHeight = Math.max(rect.height || host.clientHeight || window.innerHeight, 1);
  }
}

function renderStar(preset){
  const size = randomFloat(...preset.size);
  const left = randomFloat(...preset.x);
  const top = randomFloat(...preset.y);

  return `
    <svg
      class="student-stars-star"
      viewBox="0 0 100 100"
      data-star-left="${formatNumber(left)}"
      data-star-top="${formatNumber(top)}"
      data-star-size="${formatNumber(size)}"
      style="left:${formatNumber(left)}%; top:${formatNumber(top)}%; width:${formatNumber(size)}px; height:${formatNumber(size)}px;"
    >
      <circle cx="50" cy="50" r="50" fill="currentColor" />
    </svg>
  `;
}

function randomInt(min, max){
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function randomFloat(min, max){
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.random() * (high - low);
}

function formatNumber(value){
  return Number(value).toFixed(2);
}

function clamp(value, min, max){
  return Math.min(Math.max(value, min), max);
}
