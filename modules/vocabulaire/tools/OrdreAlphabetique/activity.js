import {
  normalizeSettings,
  LIST_TYPES,
  pickQuestion,
  questionKey
} from "./model.js";
import {
  listPublicVocabularyWordsForSpace
} from "../../../../student/student-api.js";

let currentQuestion = null;
let currentState = null;
let lastQuestionId = null;
let stylesInjected = false;
const wordListCache = new Map();

const CHIP_MARGIN = 18;
const CHIP_GAP = 12;
const ANSWER_MARGIN = 18;
const ANSWER_GAP = 18;
const ANSWER_MIN_GAP = 8;
const ANSWER_STAGGER_MS = 140;

export function mount(container) {
  injectStyles();

  container.innerHTML = `
    <div class="tool-center oa-tool-center">
      <div class="oa-root">
        <div class="oa-prompt" id="oa_prompt"></div>
        <div class="oa-workspace-shell">
          <div class="oa-workspace" id="oa_workspace"></div>
        </div>
      </div>
    </div>
  `;

  currentState = createState(container);
}

export async function nextQuestion(container, ctx) {
  if (!currentState || currentState.container !== container) {
    mount(container);
  }

  const settings = normalizeSettings(ctx?.settings);
  const workspace = currentState?.workspace || container.querySelector("#oa_workspace");
  const promptEl = container.querySelector("#oa_prompt");
  if (!workspace || !promptEl) return;

  clearAnimationTimers();
  workspace.innerHTML = `<div class="oa-loading">Chargement…</div>`;
  currentState.chips = [];
  currentState.locked = false;

  let wordEntries = [];
  if (settings.listType === LIST_TYPES.WORDS) {
    wordEntries = await loadWordEntriesForAccessCode(ctx?.accessCode);
  }

  currentQuestion = pickQuestion(settings, {
    wordEntries,
    avoidKey: lastQuestionId,
    attempts: 800
  });

  if (!currentQuestion) {
    throw new Error(settings.listType === LIST_TYPES.WORDS
      ? "Impossible de générer une question d’ordre alphabétique avec la banque de mots actuelle."
      : "Impossible de générer une question d’ordre alphabétique avec ces réglages.");
  }

  lastQuestionId = questionKey(currentQuestion);
  promptEl.textContent = currentQuestion.prompt;

  workspace.innerHTML = "";
  renderFloatingChips(workspace, currentQuestion.items);
}

export function showAnswer(container) {
  if (!currentQuestion || !currentState) return;

  currentState.locked = true;
  clearAnimationTimers();

  currentState.chips.forEach((chip) => {
    chip.classList.add("oa-chip--locked");
    chip.classList.remove("oa-chip--dragging");
  });

  const answerMap = new Map(currentQuestion.answerItems.map((item, index) => [item, index]));
  const chipsInAnswerOrder = [...currentState.chips].sort((a, b) => {
    const ai = answerMap.get(a.dataset.value) ?? 0;
    const bi = answerMap.get(b.dataset.value) ?? 0;
    return ai - bi;
  });

  const positions = computeAnswerLayout(currentState.workspace, chipsInAnswerOrder);
  animateAnswer(chipsInAnswerOrder, positions);
}

export function unmount(container) {
  clearAnimationTimers();
  container.innerHTML = "";
  currentQuestion = null;
  currentState = null;
  lastQuestionId = null;
}

async function loadWordEntriesForAccessCode(accessCode) {
  const code = String(accessCode || "").trim();
  if (!code) {
    throw new Error("Code d’accès manquant pour charger la banque de mots.");
  }

  if (!wordListCache.has(code)) {
    wordListCache.set(code, listPublicVocabularyWordsForSpace(code));
  }

  const entries = await wordListCache.get(code);
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("La banque de mots de cet enseignant est vide.");
  }

  return entries;
}

function renderFloatingChips(workspace, items) {
  const chips = items.map((value) => {
    const chip = document.createElement("div");
    chip.className = "oa-chip";
    chip.dataset.value = value;
    chip.textContent = value;
    chip.style.left = "0px";
    chip.style.top = "0px";
    workspace.appendChild(chip);
    attachDrag(workspace, chip);
    return chip;
  });

  placeAlignedAtTop(workspace, chips);
  currentState.chips = chips;
}

function attachDrag(workspace, chip) {
  let startPointerX = 0;
  let startPointerY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onPointerMove = (ev) => {
    if (currentState?.locked) return;

    const dx = ev.clientX - startPointerX;
    const dy = ev.clientY - startPointerY;

    const next = clampPosition(
      workspace,
      chip,
      startLeft + dx,
      startTop + dy
    );

    chip.style.left = `${next.x}px`;
    chip.style.top = `${next.y}px`;
  };

  const onPointerUp = (ev) => {
    try {
      chip.releasePointerCapture?.(ev.pointerId);
    } catch {}

    chip.classList.remove("oa-chip--dragging");

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };

  chip.addEventListener("pointerdown", (ev) => {
    if (currentState?.locked) return;
    ev.preventDefault();

    chip.classList.remove("oa-chip--animating");

    startPointerX = ev.clientX;
    startPointerY = ev.clientY;
    startLeft = parseFloat(chip.style.left) || 0;
    startTop = parseFloat(chip.style.top) || 0;

    chip.classList.add("oa-chip--dragging");

    try {
      chip.setPointerCapture?.(ev.pointerId);
    } catch {}

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });
}

function placeAlignedAtTop(workspace, chips) {
  const layoutOrder = shuffleArray([...chips]);
  const positions = computeTopAlignedLayout(workspace, layoutOrder);

  layoutOrder.forEach((chip, index) => {
    const pos = positions[index];
    if (!pos) return;
    chip.style.left = `${pos.x}px`;
    chip.style.top = `${pos.y}px`;
  });
}

function computeTopAlignedLayout(workspace, chips) {
  const margin = ANSWER_MARGIN;
  const workspaceWidth = Math.max(320, workspace.clientWidth);
  const availableWidth = Math.max(120, workspaceWidth - (margin * 2));
  const widths = chips.map((chip) => chip.offsetWidth);
  const heights = chips.map((chip) => chip.offsetHeight);
  const sumWidths = widths.reduce((sum, width) => sum + width, 0);

  let gap = ANSWER_GAP;
  if (chips.length > 1) {
    const maxGap = Math.floor((availableWidth - sumWidths) / (chips.length - 1));
    gap = Math.max(ANSWER_MIN_GAP, Math.min(ANSWER_GAP, maxGap));
  }

  const singleRowWidth = sumWidths + Math.max(0, chips.length - 1) * gap;

  if (singleRowWidth <= availableWidth) {
    const startX = Math.round((workspaceWidth - singleRowWidth) / 2);
    const rowHeight = Math.max(...heights, 0);
    const y = margin;
    let x = startX;

    return chips.map((chip, index) => {
      const pos = {
        x,
        y: y + Math.round((rowHeight - heights[index]) / 2)
      };
      x += widths[index] + gap;
      return pos;
    });
  }

  const rows = [];
  let currentRow = [];
  let currentWidth = 0;
  let currentHeight = 0;

  chips.forEach((chip, index) => {
    const chipWidth = widths[index];
    const chipHeight = heights[index];
    const nextWidth = currentRow.length === 0 ? chipWidth : currentWidth + ANSWER_GAP + chipWidth;

    if (currentRow.length > 0 && nextWidth > availableWidth) {
      rows.push({ items: currentRow, width: currentWidth, height: currentHeight });
      currentRow = [];
      currentWidth = 0;
      currentHeight = 0;
    }

    currentRow.push({ chip, index, chipWidth, chipHeight });
    currentWidth = currentRow.length === 1 ? chipWidth : currentWidth + ANSWER_GAP + chipWidth;
    currentHeight = Math.max(currentHeight, chipHeight);
  });

  if (currentRow.length > 0) {
    rows.push({ items: currentRow, width: currentWidth, height: currentHeight });
  }

  const rowGap = 18;
  let cursorY = margin;
  const positions = new Array(chips.length);

  rows.forEach((row) => {
    let cursorX = Math.max(margin, Math.round((workspaceWidth - row.width) / 2));

    row.items.forEach((item) => {
      positions[item.index] = {
        x: cursorX,
        y: cursorY + Math.round((row.height - item.chipHeight) / 2)
      };
      cursorX += item.chipWidth + ANSWER_GAP;
    });

    cursorY += row.height + rowGap;
  });

  return positions;
}

function clampPosition(workspace, chip, x, y) {
  const maxX = Math.max(CHIP_MARGIN, workspace.clientWidth - chip.offsetWidth - CHIP_MARGIN);
  const maxY = Math.max(CHIP_MARGIN, workspace.clientHeight - chip.offsetHeight - CHIP_MARGIN);

  return {
    x: Math.max(CHIP_MARGIN, Math.min(maxX, Math.round(x))),
    y: Math.max(CHIP_MARGIN, Math.min(maxY, Math.round(y)))
  };
}

function computeAnswerLayout(workspace, chips) {
  const margin = ANSWER_MARGIN;
  const workspaceWidth = Math.max(320, workspace.clientWidth);
  const workspaceHeight = Math.max(220, workspace.clientHeight);
  const widths = chips.map((chip) => chip.offsetWidth);
  const heights = chips.map((chip) => chip.offsetHeight);
  const sumWidths = widths.reduce((sum, width) => sum + width, 0);
  const availableWidth = Math.max(120, workspaceWidth - (margin * 2));

  let gap = ANSWER_GAP;
  if (chips.length > 1) {
    const maxGap = Math.floor((availableWidth - sumWidths) / (chips.length - 1));
    gap = Math.max(ANSWER_MIN_GAP, Math.min(ANSWER_GAP, maxGap));
  }

  const singleRowWidth = sumWidths + Math.max(0, chips.length - 1) * gap;

  if (singleRowWidth <= availableWidth) {
    const startX = Math.round((workspaceWidth - singleRowWidth) / 2);
    const rowHeight = Math.max(...heights, 0);
    const y = Math.max(margin, Math.round((workspaceHeight - rowHeight) / 2));
    let x = startX;

    return chips.map((chip, index) => {
      const pos = {
        x,
        y: y + Math.round((rowHeight - heights[index]) / 2)
      };
      x += widths[index] + gap;
      return pos;
    });
  }

  const rows = [];
  let currentRow = [];
  let currentWidth = 0;
  let currentHeight = 0;

  chips.forEach((chip, index) => {
    const chipWidth = widths[index];
    const chipHeight = heights[index];
    const nextWidth = currentRow.length === 0 ? chipWidth : currentWidth + ANSWER_GAP + chipWidth;

    if (currentRow.length > 0 && nextWidth > availableWidth) {
      rows.push({ items: currentRow, width: currentWidth, height: currentHeight });
      currentRow = [];
      currentWidth = 0;
      currentHeight = 0;
    }

    currentRow.push({ chip, index, chipWidth, chipHeight });
    currentWidth = currentRow.length === 1 ? chipWidth : currentWidth + ANSWER_GAP + chipWidth;
    currentHeight = Math.max(currentHeight, chipHeight);
  });

  if (currentRow.length > 0) {
    rows.push({ items: currentRow, width: currentWidth, height: currentHeight });
  }

  const rowGap = 18;
  const totalHeight = rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * rowGap;
  let cursorY = Math.max(margin, Math.round((workspaceHeight - totalHeight) / 2));
  const positions = new Array(chips.length);

  rows.forEach((row) => {
    let cursorX = Math.max(margin, Math.round((workspaceWidth - row.width) / 2));

    row.items.forEach((item) => {
      positions[item.index] = {
        x: cursorX,
        y: cursorY + Math.round((row.height - item.chipHeight) / 2)
      };
      cursorX += item.chipWidth + ANSWER_GAP;
    });

    cursorY += row.height + rowGap;
  });

  return positions;
}

function animateAnswer(chips, positions) {
  chips.forEach((chip) => chip.classList.remove("oa-chip--animating"));

  chips.forEach((chip, index) => {
    const pos = positions[index];
    if (!pos) return;

    const timerId = window.setTimeout(() => {
      chip.classList.add("oa-chip--animating");
      chip.style.left = `${pos.x}px`;
      chip.style.top = `${pos.y}px`;
    }, index * ANSWER_STAGGER_MS);

    currentState?.timers.push(timerId);
  });
}

function clearAnimationTimers() {
  if (!currentState?.timers) return;
  currentState.timers.forEach((timerId) => window.clearTimeout(timerId));
  currentState.timers = [];
}

function createState(container) {
  return {
    container,
    workspace: container.querySelector("#oa_workspace"),
    chips: [],
    locked: false,
    timers: []
  };
}

function rectsOverlap(a, b, gap = 0) {
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

function shuffleArray(items) {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-oa-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.oaActivityStyle = href;
  document.head.appendChild(link);
}
