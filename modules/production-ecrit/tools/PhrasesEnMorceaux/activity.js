import {
  normalizeSettings,
  getPhrasePoolForStudent
} from "./model.js";

/* =========================
   STATE
   ========================= */

let state = createEmptyState();
let stylesInjected = false;
let stylesReadyPromise = null;
const CHIP_MARGIN = 18;
const CHIP_GAP = 12;
const RANDOM_TRIES = 120;
const SNAP_DISTANCE = 28;
const SNAP_ROW_TOLERANCE = 26;

function injectActivityStyles(){
  if (stylesReadyPromise) return stylesReadyPromise;

  const href = new URL("./activity.css", import.meta.url).href;
  const existing = document.querySelector(`link[data-pem-activity-style="${href}"]`);

  if (existing) {
    stylesInjected = true;

    stylesReadyPromise = new Promise((resolve) => {
      if (existing.sheet) {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
    });

    return stylesReadyPromise;
  }

  stylesInjected = true;

  stylesReadyPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.pemActivityStyle = href;

    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });

    document.head.appendChild(link);
  });

  return stylesReadyPromise;
}

/* =========================
   PUBLIC API
   ========================= */

export async function mount(container) {
  await injectActivityStyles();

  container.innerHTML = `
    <div class="pem-root">
      <div class="pem-workspace-wrap">
        <div id="pem_workspace" class="pem-workspace"></div>
      </div>
    </div>
  `;
}

export async function nextQuestion(container, ctx) {
  await injectActivityStyles();

  const settings = normalizeSettings(ctx?.settings);
  const pool = getPhrasePoolForStudent(settings, ctx?.student);

  if (!Array.isArray(pool) || pool.length === 0) {
    state = {
      ...createEmptyState(),
      chips: [
        {
          id: `${Date.now()}_fallback`,
          text: "Aucune phrase",
          x: 0,
          y: 0
        }
      ]
    };
    reset(container);
    return;
  }

  const phrase = pick(pool);

  state = {
    ...createEmptyState(),
    chips: phrase.segments.map((text, i) => ({
      id: `${Date.now()}_${i}`,
      text,
      x: 0,
      y: 0
    }))
  };

  reset(container);
}

export function unmount(container) {
  container.innerHTML = "";
  state = createEmptyState();
}

/* =========================
   CORE
   ========================= */

function reset(container) {
  const ws = container.querySelector("#pem_workspace");
  if (!ws) return;

  ws.innerHTML = state.chips.map((c) => chipHTML(c)).join("");

  const layout = () => {
    const nodes = [...ws.querySelectorAll(".pem-chip")];
    if (!nodes.length) return;

    placeChipsRandomly(nodes, ws);

    nodes.forEach((el) => {
      enableDrag(el, ws);
    });
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(layout);
  });
}

/* =========================
   DRAG
   ========================= */

function enableDrag(el, workspace) {
  let startPointerX = 0;
  let startPointerY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onPointerMove = (ev) => {
    const dx = ev.clientX - startPointerX;
    const dy = ev.clientY - startPointerY;

    const next = clampChipPosition(
      startLeft + dx,
      startTop + dy,
      el,
      workspace
    );

    el.style.left = `${next.x}px`;
    el.style.top = `${next.y}px`;
  };

  const onPointerUp = (ev) => {
    try {
      el.releasePointerCapture?.(ev.pointerId);
    } catch {}

    el.classList.remove("pem-chip--dragging");

    const snapped = applySnap(el, workspace);
    el.style.left = `${snapped.x}px`;
    el.style.top = `${snapped.y}px`;

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };

  el.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();

    startPointerX = ev.clientX;
    startPointerY = ev.clientY;
    startLeft = parseFloat(el.style.left) || 0;
    startTop = parseFloat(el.style.top) || 0;

    el.classList.add("pem-chip--dragging");

    try {
      el.setPointerCapture?.(ev.pointerId);
    } catch {}

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });
}

function placeChipsRandomly(nodes, workspace) {
  const placedRects = [];

  for (const el of nodes) {
    const pos = findFreeRandomPosition(el, workspace, placedRects);
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;

    placedRects.push({
      left: pos.x,
      top: pos.y,
      right: pos.x + el.offsetWidth,
      bottom: pos.y + el.offsetHeight
    });
  }
}

function findFreeRandomPosition(el, workspace, placedRects) {
  const width = el.offsetWidth;
  const height = el.offsetHeight;

  const minX = CHIP_MARGIN;
  const minY = CHIP_MARGIN;
  const maxX = Math.max(minX, workspace.clientWidth - width - CHIP_MARGIN);
  const maxY = Math.max(minY, workspace.clientHeight - height - CHIP_MARGIN);

  for (let i = 0; i < RANDOM_TRIES; i++) {
    const x = randomInt(minX, maxX);
    const y = randomInt(minY, maxY);

    const rect = {
      left: x,
      top: y,
      right: x + width,
      bottom: y + height
    };

    const overlaps = placedRects.some((other) => rectsOverlap(rect, other, CHIP_GAP));
    if (!overlaps) return { x, y };
  }

  const stepX = Math.max(28, Math.floor(width * 0.35));
  const stepY = Math.max(28, Math.floor(height * 0.5));

  for (let y = minY; y <= maxY; y += stepY) {
    for (let x = minX; x <= maxX; x += stepX) {
      const rect = {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height
      };

      const overlaps = placedRects.some((other) => rectsOverlap(rect, other, CHIP_GAP));
      if (!overlaps) return { x, y };
    }
  }

  return { x: minX, y: minY };
}

function clampChipPosition(x, y, el, workspace) {
  const maxX = Math.max(CHIP_MARGIN, workspace.clientWidth - el.offsetWidth - CHIP_MARGIN);
  const maxY = Math.max(CHIP_MARGIN, workspace.clientHeight - el.offsetHeight - CHIP_MARGIN);

  return {
    x: Math.max(CHIP_MARGIN, Math.min(maxX, Math.round(x))),
    y: Math.max(CHIP_MARGIN, Math.min(maxY, Math.round(y)))
  };
}

function applySnap(el, workspace) {
  const currentLeft = parseFloat(el.style.left) || 0;
  const currentTop = parseFloat(el.style.top) || 0;

  let best = {
    x: currentLeft,
    y: currentTop,
    score: Number.POSITIVE_INFINITY
  };

  const others = [...workspace.querySelectorAll(".pem-chip")].filter((node) => node !== el);

  const selfWidth = el.offsetWidth;
  const selfHeight = el.offsetHeight;
  const selfCenterY = currentTop + (selfHeight / 2);

  for (const other of others) {
    const otherLeft = parseFloat(other.style.left) || 0;
    const otherTop = parseFloat(other.style.top) || 0;
    const otherWidth = other.offsetWidth;
    const otherHeight = other.offsetHeight;
    const otherCenterY = otherTop + (otherHeight / 2);

    const rowDelta = Math.abs(selfCenterY - otherCenterY);
    if (rowDelta > SNAP_ROW_TOLERANCE) continue;

    const snapRightOfOther = {
      x: otherLeft + otherWidth + CHIP_GAP,
      y: otherTop
    };

    const distRight = Math.abs(currentLeft - snapRightOfOther.x) + rowDelta;

    if (Math.abs(currentLeft - snapRightOfOther.x) <= SNAP_DISTANCE && distRight < best.score) {
      best = {
        x: snapRightOfOther.x,
        y: snapRightOfOther.y,
        score: distRight
      };
    }

    const snapLeftOfOther = {
      x: otherLeft - selfWidth - CHIP_GAP,
      y: otherTop
    };

    const selfRight = currentLeft + selfWidth;
    const targetRight = snapLeftOfOther.x + selfWidth;
    const distLeft = Math.abs(selfRight - targetRight) + rowDelta;

    if (Math.abs(selfRight - targetRight) <= SNAP_DISTANCE && distLeft < best.score) {
      best = {
        x: snapLeftOfOther.x,
        y: snapLeftOfOther.y,
        score: distLeft
      };
    }
  }

  return clampChipPosition(best.x, best.y, el, workspace);
}

function rectsOverlap(a, b, gap = 0) {
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

function randomInt(min, max) {
  const a = Math.ceil(Math.min(min, max));
  const b = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

/* =========================
   UTILS
   ========================= */

function chipHTML(c) {
  return `
    <div class="pem-chip" style="position:absolute;">
      ${c.text}
    </div>
  `;
}

function pick(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return { segments: ["Aucune phrase"] };
  }

  return list[Math.floor(Math.random() * list.length)];
}

function createEmptyState() {
  return { chips: [] };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}