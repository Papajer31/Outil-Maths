import {
  WORKSHEET_LAYOUTS,
  clampInteger,
  generateMagicSquareWorksheet,
  generateNumberMysteryWorksheet,
  generatePentominoWorksheet,
  generateWordSearchWorksheet,
  PENTOMINO_SHAPES,
  parseWordSearchWords,
  getWorksheetLayout,
  normalizeMagicSum,
  paginateWorksheetItems
} from "./worksheet-generator-core.js";
import { downloadPentominoMaterialPdf, downloadWorksheetPdf } from "./worksheet-pdf.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";
import {
  bindBasicMinMax,
  bindStepperField,
  renderBasicMinMax,
  renderStepperField
} from "../../../shared/config-widgets.js";

const MAGIC_SQUARE_GENERATOR_ID = "magic-square";
const NUMBER_MYSTERY_GENERATOR_ID = "number-mystery";
const WORD_SEARCH_GENERATOR_ID = "word-search";
const PENTOMINO_GENERATOR_ID = "pentomino";
const WORKSHEET_PER_PAGE_OPTIONS = Object.freeze([1, 2, 4, 6, 8]);
const WORD_SEARCH_PER_PAGE_OPTIONS = Object.freeze([1, 2, 4, 6]);
const GENERATOR_SETTINGS_VERSION = 1;
const GENERATOR_SETTINGS_SAVE_DELAY_MS = 2000;

const MAGIC_SQUARE_DEFAULT_CONFIG = Object.freeze({
  differentExercises:true,
  perPage:6,
  pageCount:1,
  sum:15,
  givenCount:3,
  showSums:true,
  cutLines:true,
  landscape:false
});

const NUMBER_MYSTERY_DEFAULT_CONFIG = Object.freeze({
  differentExercises:true,
  perPage:4,
  pageCount:1,
  cutLines:true,
  landscape:false,
  targetMin:80,
  targetMax:89,
  operandMin:20,
  operandMax:70,
  useAdd:true,
  useSub:false,
  useMul:false,
  useDiv:false,
  calculationForm:"result"
});

const PENTOMINO_DEFAULT_CONFIG = Object.freeze({
  differentExercises:true,
  perPage:4,
  pageCount:1,
  cutLines:true,
  landscape:false,
  materialCellSizeMm:20,
  materialDuplex:false,
  materialVersoOffsetXmm:0,
  materialVersoOffsetYmm:0
});

const WORD_SEARCH_DEFAULT_CONFIG = Object.freeze({
  differentExercises:true,
  perPage:4,
  pageCount:1,
  cutLines:true,
  landscape:false,
  sourceType:"custom",
  sourceWords:"CHAT\nCHIEN\nLAPIN\nLION\nTIGRE\nSOURIS",
  gridSize:10,
  directions:["right","down"],
  showWordList:true
});

function getDefaultConfig(generatorId){
  if (generatorId === PENTOMINO_GENERATOR_ID) return { ...PENTOMINO_DEFAULT_CONFIG };
  if (generatorId === WORD_SEARCH_GENERATOR_ID) return { ...WORD_SEARCH_DEFAULT_CONFIG };
  return generatorId === NUMBER_MYSTERY_GENERATOR_ID
    ? { ...NUMBER_MYSTERY_DEFAULT_CONFIG }
    : { ...MAGIC_SQUARE_DEFAULT_CONFIG };
}

function getPersistableConfig(generatorId, source = {}){
  const defaults = getDefaultConfig(generatorId);
  return Object.fromEntries(
    Object.keys(defaults).map((key) => [key, key in source ? source[key] : defaults[key]])
  );
}

function serializePersistableConfig(generatorId, source = {}){
  return JSON.stringify(getPersistableConfig(generatorId, source));
}

function normalizePerPage(value, generatorId = ""){
  const numeric = Number(value);
  if (generatorId === WORD_SEARCH_GENERATOR_ID) return WORD_SEARCH_PER_PAGE_OPTIONS.includes(numeric) ? numeric : 4;
  return WORKSHEET_LAYOUTS[numeric] ? numeric : 6;
}

function getWordSearchLandscape(perPage){
  return Number(perPage) === 2 || Number(perPage) === 6;
}

const WORD_SEARCH_DIRECTION_OPTIONS = Object.freeze([
  { id:"right", icon:"east", label:"Vers la droite" },
  { id:"down", icon:"south", label:"Vers le bas" },
  { id:"upRight", icon:"north_east", label:"Diagonale vers le haut à droite" },
  { id:"downRight", icon:"south_east", label:"Diagonale vers le bas à droite" },
  { id:"up", icon:"north", label:"Vers le haut" },
  { id:"left", icon:"west", label:"Vers la gauche" },
  { id:"upLeft", icon:"north_west", label:"Diagonale vers le haut à gauche" },
  { id:"downLeft", icon:"south_west", label:"Diagonale vers le bas à gauche" }
]);

function normalizeWordSearchDirections(value, legacyDifficulty = "easy"){
  const allowed = new Set(WORD_SEARCH_DIRECTION_OPTIONS.map((option) => option.id));
  const source = Array.isArray(value) ? value.filter((item) => allowed.has(item)) : [];
  if (source.length) return [...new Set(source)];
  if (legacyDifficulty === "hard") return WORD_SEARCH_DIRECTION_OPTIONS.map((option) => option.id);
  if (legacyDifficulty === "medium") return ["right","down","downRight","downLeft"];
  return ["right","down"];
}

function renderPerPageStepper(value, generatorId = ""){
  const options = generatorId === WORD_SEARCH_GENERATOR_ID ? WORD_SEARCH_PER_PAGE_OPTIONS : WORKSHEET_PER_PAGE_OPTIONS;
  const safeValue = normalizePerPage(value, generatorId);
  const optionIndex = options.indexOf(safeValue);
  const canDecrease = optionIndex > 0;
  const canIncrease = optionIndex >= 0 && optionIndex < options.length - 1;

  return `
    <div class="tv-stepper tv-stepper-no-inline-label" role="group" aria-label="Exercices par page">
      <button
        class="tv-stepper-btn"
        type="button"
        data-generator-per-page-direction="-1"
        aria-label="Diminuer le nombre d’exercices par page"
        ${canDecrease ? "" : "disabled"}
      >
        <span class="tv-stepper-icon" aria-hidden="true">remove</span>
      </button>
      <input
        class="tv-input tv-input-stepper"
        id="worksheet-per-page"
        type="text"
        value="${escapeAttr(safeValue)}"
        readonly
        aria-label="Exercices par page"
      >
      <button
        class="tv-stepper-btn"
        type="button"
        data-generator-per-page-direction="1"
        aria-label="Augmenter le nombre d’exercices par page"
        ${canIncrease ? "" : "disabled"}
      >
        <span class="tv-stepper-icon" aria-hidden="true">add</span>
      </button>
    </div>
  `;
}

function getTotalSlots(config, generatorId = ""){
  return normalizePerPage(config?.perPage, generatorId) * clampInteger(config?.pageCount, 1, 20, 1);
}

function cloneRepeatedExercise(exercise, index){
  return {
    ...exercise,
    id:`${exercise.id}-copy-${index + 1}`,
    number:index + 1,
    values:Array.isArray(exercise.values) ? [...exercise.values] : exercise.values,
    givenIndexes:Array.isArray(exercise.givenIndexes) ? [...exercise.givenIndexes] : exercise.givenIndexes,
    gridNumbers:Array.isArray(exercise.gridNumbers) ? [...exercise.gridNumbers] : exercise.gridNumbers,
    operations:Array.isArray(exercise.operations)
      ? exercise.operations.map((operation) => ({ ...operation }))
      : exercise.operations,
    grid:Array.isArray(exercise.grid) ? exercise.grid.map((row) => [...row]) : exercise.grid,
    words:Array.isArray(exercise.words) ? [...exercise.words] : exercise.words,
    placements:Array.isArray(exercise.placements) ? exercise.placements.map((placement) => ({ ...placement, cells:(placement.cells || []).map((cell) => [...cell]) })) : exercise.placements,
    pieces:Array.isArray(exercise.pieces) ? [...exercise.pieces] : exercise.pieces,
    stages:Array.isArray(exercise.stages) ? exercise.stages.map((stage) => ({ ...stage, solution:(stage.solution || []).map((placement) => ({ ...placement, cells:(placement.cells || []).map((cell) => [...cell]) })) })) : exercise.stages,
    parameters:exercise.parameters ? { ...exercise.parameters } : exercise.parameters
  };
}

function repeatWorksheetExercise(generated, totalSlots){
  const source = generated.exercises[0];
  const exercises = Array.from({ length:totalSlots }, (_, index) => cloneRepeatedExercise(source, index));
  return {
    ...generated,
    exerciseCount:totalSlots,
    exercises
  };
}

function buildMagicSquareWorksheet(config){
  const totalSlots = getTotalSlots(config, MAGIC_SQUARE_GENERATOR_ID);
  const requestedCount = config.differentExercises ? totalSlots : 1;
  const generated = generateMagicSquareWorksheet({
    exerciseCount:requestedCount,
    sum:config.sum,
    givenCount:config.givenCount
  });

  if (!config.differentExercises) return repeatWorksheetExercise(generated, totalSlots);
  return {
    ...generated,
    exerciseCount:totalSlots,
    exercises:generated.exercises.slice(0, totalSlots)
  };
}

function buildNumberMysteryWorksheet(config){
  const totalSlots = getTotalSlots(config, NUMBER_MYSTERY_GENERATOR_ID);
  const requestedCount = config.differentExercises ? totalSlots : 1;
  const generated = generateNumberMysteryWorksheet({
    exerciseCount:requestedCount,
    targetMin:config.targetMin,
    targetMax:config.targetMax,
    operandMin:config.operandMin,
    operandMax:config.operandMax,
    useAdd:config.useAdd,
    useSub:config.useSub,
    useMul:config.useMul,
    useDiv:config.useDiv,
    calculationForm:config.calculationForm
  });

  if (!config.differentExercises) return repeatWorksheetExercise(generated, totalSlots);
  return {
    ...generated,
    exerciseCount:totalSlots,
    exercises:generated.exercises.slice(0, totalSlots)
  };
}

function buildWordSearchWorksheet(config){
  const totalSlots = getTotalSlots(config, WORD_SEARCH_GENERATOR_ID);
  const requestedCount = config.differentExercises ? totalSlots : 1;
  const generated = generateWordSearchWorksheet({
    exerciseCount:requestedCount,
    words:config.resolvedWords || config.sourceWords,
    gridSize:config.gridSize,
    directions:config.directions
  });
  if (!config.differentExercises) return repeatWorksheetExercise(generated, totalSlots);
  return { ...generated, exerciseCount:totalSlots, exercises:generated.exercises.slice(0, totalSlots) };
}

function buildPentominoWorksheet(config){
  const totalSlots = getTotalSlots(config, PENTOMINO_GENERATOR_ID);
  const requestedCount = config.differentExercises ? totalSlots : 1;
  const generated = generatePentominoWorksheet({ exerciseCount:requestedCount });
  if (!config.differentExercises) return repeatWorksheetExercise(generated, totalSlots);
  return { ...generated, exerciseCount:totalSlots, exercises:generated.exercises.slice(0, totalSlots) };
}

function buildWorksheet(generatorId, config){
  if (generatorId === PENTOMINO_GENERATOR_ID) return buildPentominoWorksheet(config);
  if (generatorId === WORD_SEARCH_GENERATOR_ID) return buildWordSearchWorksheet(config);
  return generatorId === NUMBER_MYSTERY_GENERATOR_ID
    ? buildNumberMysteryWorksheet(config)
    : buildMagicSquareWorksheet(config);
}

function renderMagicArrow(direction){
  const paths = {
    right:"M3 12h12 M11 6l6 6-6 6",
    down:"M12 3v12 M6 11l6 6 6-6",
    southeast:"M4 4l9 9 M9 15h6V9",
    southwest:"M20 4l-9 9 M15 15H9V9"
  };
  const path = paths[direction] || paths.right;
  return `<svg class="dashboard-magic-square-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>`;
}

function renderMagicSquareCard(exercise, { showSolutions = false, showSums = true } = {}){
  const givenIndexes = new Set(exercise.givenIndexes || []);
  const visibleIndexes = showSolutions
    ? new Set([0, 1, 2, 3, 4, 5, 6, 7, 8])
    : givenIndexes;
  const values = Array.isArray(exercise.values) ? exercise.values : [];
  const sum = Number(exercise.sum) || 0;

  return `
    <article class="dashboard-magic-square-card ${showSolutions ? "is-solution" : ""}">
      <div class="dashboard-magic-square-card-content">
        <div class="dashboard-magic-square-card-title">
          <span>Complète ce carré magique</span>
        </div>
        <div class="dashboard-magic-square-sum-line${showSums ? " is-hidden" : ""}" aria-hidden="${showSums ? "true" : "false"}">
          Somme = ${escapeHtml(sum)}
        </div>
        <div class="dashboard-magic-square-workarea">
          <div class="dashboard-magic-square-board" role="table" aria-label="Carré magique 3 par 3">
            ${values.map((value, index) => `
              <div class="dashboard-magic-square-cell ${showSolutions && !givenIndexes.has(index) ? "is-correction" : ""}" role="cell">${visibleIndexes.has(index) ? escapeHtml(value) : ""}</div>
            `).join("")}
          </div>
          <div class="dashboard-magic-square-right-sums${showSums ? "" : " is-hidden"}" aria-hidden="${showSums ? "false" : "true"}">
            <span>${renderMagicArrow("right")}<em>${escapeHtml(sum)}</em></span>
            <span>${renderMagicArrow("right")}<em>${escapeHtml(sum)}</em></span>
            <span>${renderMagicArrow("right")}<em>${escapeHtml(sum)}</em></span>
          </div>
          <div class="dashboard-magic-square-bottom-sums${showSums ? "" : " is-hidden"}" aria-hidden="${showSums ? "false" : "true"}">
            <span>${renderMagicArrow("southwest")}<em>${escapeHtml(sum)}</em></span>
            <span>${renderMagicArrow("down")}<em>${escapeHtml(sum)}</em></span>
            <span>${renderMagicArrow("down")}<em>${escapeHtml(sum)}</em></span>
            <span>${renderMagicArrow("down")}<em>${escapeHtml(sum)}</em></span>
            <span>${renderMagicArrow("southeast")}<em>${escapeHtml(sum)}</em></span>
          </div>
        </div>
      </div>
    </article>
  `;
}

function numberMysteryOperationSymbol(kind){
  if (kind === "sub") return "−";
  if (kind === "mul") return "×";
  if (kind === "div") return "÷";
  return "+";
}

function renderNumberMysteryValue(value, isCorrectionValue){
  return isCorrectionValue
    ? `<span class="dashboard-number-mystery-correction-value">${escapeHtml(value)}</span>`
    : escapeHtml(value);
}

function renderNumberMysteryOperation(operation, showSolutions){
  const a = Number(operation?.a) || 0;
  const b = Number(operation?.b) || 0;
  const result = Number(operation?.result) || 0;
  const blank = String(operation?.blank || "result");
  const symbol = numberMysteryOperationSymbol(operation?.kind);
  const blankHtml = '<span class="dashboard-number-mystery-blank">…</span>';

  if (showSolutions) {
    return `${renderNumberMysteryValue(a, blank === "a")} <span class="dashboard-number-mystery-op-symbol">${symbol}</span> ${renderNumberMysteryValue(b, blank === "b")} = ${renderNumberMysteryValue(result, blank === "result")}`;
  }

  const leftA = blank === "a" ? blankHtml : escapeHtml(a);
  const leftB = blank === "b" ? blankHtml : escapeHtml(b);
  const right = blank === "result" ? blankHtml : escapeHtml(result);
  return `${leftA} <span class="dashboard-number-mystery-op-symbol">${symbol}</span> ${leftB} = ${right}`;
}

function renderNumberMysteryCard(exercise, { showSolutions = false } = {}){
  const gridNumbers = Array.isArray(exercise.gridNumbers) ? exercise.gridNumbers : [];
  const operations = Array.isArray(exercise.operations) ? exercise.operations : [];
  const mystery = Number(exercise.mystery) || 0;

  return `
    <article class="dashboard-number-mystery-card ${showSolutions ? "is-solution" : ""}">
      <div class="dashboard-number-mystery-card-content">
        <div class="dashboard-number-mystery-card-title">
          <span>Quel est le nombre mystérieux&nbsp;?</span>
        </div>

        <div class="dashboard-number-mystery-board" role="table" aria-label="Grille de nombres">
          ${gridNumbers.map((value) => `
            <div class="dashboard-number-mystery-cell ${showSolutions && Number(value) === mystery ? "is-mystery" : ""}" role="cell">${escapeHtml(value)}</div>
          `).join("")}
        </div>

        <div class="dashboard-number-mystery-operations" aria-label="Calculs">
          ${operations.slice(0, 8).map((operation) => `
            <div class="dashboard-number-mystery-operation">${renderNumberMysteryOperation(operation, showSolutions)}</div>
          `).join("")}
        </div>

        <div class="dashboard-number-mystery-answer">
          <span>Nombre mystérieux&nbsp;:</span>
          <strong class="${showSolutions ? "is-correction" : ""}">${showSolutions ? escapeHtml(mystery) : "…………"}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderWordSearchSolutionContours(placements, size){
  const contours = (placements || []).map((placement) => {
    const cells = Array.isArray(placement?.cells) ? placement.cells : [];
    const first = cells[0];
    const last = cells.at(-1);
    if (!Array.isArray(first) || !Array.isArray(last)) return "";

    const startRow = Number(first[0]) || 0;
    const startColumn = Number(first[1]) || 0;
    const endRow = Number(last[0]) || 0;
    const endColumn = Number(last[1]) || 0;
    const deltaX = endColumn - startColumn;
    const deltaY = endRow - startRow;
    const centerX = (startColumn + endColumn + 1) / 2;
    const centerY = (startRow + endRow + 1) / 2;
    const length = Math.hypot(deltaX, deltaY) + 0.84;
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    const x = centerX - (length / 2);
    const y = centerY - 0.42;
    const number = (value) => Number(value.toFixed(4));

    return `<rect x="${number(x)}" y="${number(y)}" width="${number(length)}" height=".84" rx=".16" transform="rotate(${number(angle)} ${number(centerX)} ${number(centerY)})"></rect>`;
  }).join("");

  if (!contours) return "";
  return `<svg class="dashboard-word-search-solution-contours" viewBox="0 0 ${escapeAttr(size)} ${escapeAttr(size)}" aria-hidden="true" focusable="false">${contours}</svg>`;
}

function renderWordSearchCard(exercise, { showSolutions = false, showWordList = true } = {}){
  const size = Number(exercise?.gridSize) || 10;
  const words = Array.isArray(exercise?.words) ? exercise.words : [];
  const wordListRows = Math.max(1, Math.ceil(words.length / 3));
  const wordListHtml = words.map((word, index) => {
    const column = Math.min(3, Math.floor(index / wordListRows) + 1);
    const row = (index % wordListRows) + 1;
    return `<span style="grid-column:${column};grid-row:${row}">${escapeHtml(word)}</span>`;
  }).join("");
  return `
    <article class="dashboard-word-search-card ${showWordList ? "has-word-list" : ""} ${showSolutions ? "is-solution" : ""}">
      <div class="dashboard-word-search-board-wrap">
        <div class="dashboard-word-search-board" style="--word-search-size:${escapeAttr(size)}" role="table" aria-label="Grille de mots mêlés">
          ${(exercise?.grid || []).flatMap((row, rowIndex) => (row || []).map((letter, colIndex) => `
            <div class="dashboard-word-search-cell" role="cell">${escapeHtml(letter)}</div>
          `)).join("")}
          ${showSolutions ? renderWordSearchSolutionContours(exercise?.placements, size) : ""}
        </div>
      </div>
      ${showWordList ? `
        <div class="dashboard-word-search-word-list" style="--word-search-list-rows:${escapeAttr(wordListRows)}">${wordListHtml}</div>
      ` : ""}
    </article>
  `;
}


function getPentominoBounds(cells){
  const source = Array.isArray(cells) ? cells : [];
  return {
    width:Math.max(1, ...source.map(([x]) => Number(x) + 1)),
    height:Math.max(1, ...source.map(([,y]) => Number(y) + 1))
  };
}

function normalizePentominoCells(cells){
  const source = (Array.isArray(cells) ? cells : []).map(([x,y]) => [Number(x), Number(y)]);
  if (!source.length) return [];
  const minX = Math.min(...source.map(([x]) => x));
  const minY = Math.min(...source.map(([,y]) => y));
  return source.map(([x,y]) => [x - minX, y - minY]);
}

function getPentominoShapeMetrics(name){
  const cells = normalizePentominoCells(PENTOMINO_SHAPES[name] || []);
  const bounds = getPentominoBounds(cells);
  return { name, cells, width:bounds.width, height:bounds.height };
}

function sum(values){
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

const PENTOMINO_CORRECTION_COLORS = Object.freeze([
  "#dfe5f1", "#f2dfd5", "#dcead9", "#f1e6b8",
  "#e4dbf2", "#d7eceb", "#f3d7de", "#e7e7e7"
]);

function getPentominoColorMap(pieces){
  const names = Array.isArray(pieces) ? pieces : [];
  return new Map(names.map((name, index) => [name, PENTOMINO_CORRECTION_COLORS[index % PENTOMINO_CORRECTION_COLORS.length]]));
}

function buildPentominoChallengeLayout(pieces, width = 100, height = 100){
  const minSide = Math.min(width, height);
  const pad = minSide * 0.055;
  const titleSize = minSide * 0.043;
  const titleH = titleSize * 1.55;
  const contentGap = minSide * 0.018;
  const contentX = pad;
  const contentY = pad + titleH + contentGap;
  const contentW = Math.max(1, width - (pad * 2));
  const contentH = Math.max(1, height - (pad * 2) - titleH - contentGap);
  const first = pieces.slice(0, 4).map(getPentominoShapeMetrics);
  const added = pieces.slice(4, 8).map(getPentominoShapeMetrics);
  const pieceGapUnits = 0.8;
  const rowGapUnits = 0.75;
  const plusWidthUnits = 0.95;
  const plusGapUnits = 0.5;
  const rows = [];

  if (first.length) {
    rows.push({
      type:"first",
      pieces:first,
      widthUnits:sum(first.map((piece) => piece.width)) + (pieceGapUnits * Math.max(0, first.length - 1)),
      heightUnits:Math.max(...first.map((piece) => piece.height), 1)
    });
  }

  added.forEach((piece) => {
    rows.push({
      type:"added",
      piece,
      widthUnits:plusWidthUnits + plusGapUnits + piece.width,
      heightUnits:Math.max(piece.height, 1)
    });
  });

  const maxRowWidthUnits = Math.max(...rows.map((row) => row.widthUnits), 1);
  const totalHeightUnits = sum(rows.map((row) => row.heightUnits)) + (rowGapUnits * Math.max(0, rows.length - 1));
  const cell = Math.min(contentW / maxRowWidthUnits, contentH / Math.max(totalHeightUnits, 1));
  const blockW = maxRowWidthUnits * cell;
  const blockH = totalHeightUnits * cell;
  let cursorY = contentY + ((contentH - blockH) / 2);

  const layoutRows = rows.map((row) => {
    const rowW = row.widthUnits * cell;
    const rowH = row.heightUnits * cell;
    const rowX = contentX + ((contentW - rowW) / 2);
    const entry = { ...row, x:rowX, y:cursorY, w:rowW, h:rowH };
    cursorY += rowH + (rowGapUnits * cell);
    return entry;
  });

  return {
    title:{ x:pad, y:pad, w:width - (pad * 2), h:titleH, size:titleSize },
    cell,
    pieceGap:pieceGapUnits * cell,
    plusWidth:plusWidthUnits * cell,
    plusGap:plusGapUnits * cell,
    plusSize:minSide * 0.047,
    rows:layoutRows
  };
}

function renderPentominoShapeSvg(piece, originX, originY, cell, className = "dashboard-pentomino-shape"){
  const safeCell = Number(cell) || 1;
  const cells = Array.isArray(piece?.cells) ? piece.cells : [];
  const cellSet = new Set(cells.map(([x,y]) => `${x},${y}`));
  const edges = [];
  for (const [x,y] of cells) {
    if (!cellSet.has(`${x},${y - 1}`)) edges.push([originX + (x * safeCell), originY + (y * safeCell), originX + ((x + 1) * safeCell), originY + (y * safeCell)]);
    if (!cellSet.has(`${x + 1},${y}`)) edges.push([originX + ((x + 1) * safeCell), originY + (y * safeCell), originX + ((x + 1) * safeCell), originY + ((y + 1) * safeCell)]);
    if (!cellSet.has(`${x},${y + 1}`)) edges.push([originX + ((x + 1) * safeCell), originY + ((y + 1) * safeCell), originX + (x * safeCell), originY + ((y + 1) * safeCell)]);
    if (!cellSet.has(`${x - 1},${y}`)) edges.push([originX + (x * safeCell), originY + ((y + 1) * safeCell), originX + (x * safeCell), originY + (y * safeCell)]);
  }
  return `
    <g class="${className}" aria-label="Pentamino ${escapeAttr(piece?.name || "")}">
      ${cells.map(([x,y]) => `<rect x="${escapeAttr(originX + (x * safeCell))}" y="${escapeAttr(originY + (y * safeCell))}" width="${escapeAttr(safeCell)}" height="${escapeAttr(safeCell)}"></rect>`).join("")}
      <path d="${edges.map(([x1,y1,x2,y2]) => `M${x1} ${y1}L${x2} ${y2}`).join(" ")}" stroke-width="${escapeAttr(Math.max(0.7, safeCell * 0.085))}"></path>
    </g>`;
}

function buildPentominoCorrectionLayout(exercise, width = 100, height = 100){
  const minSide = Math.min(width, height);
  const pad = minSide * 0.055;
  const titleSize = minSide * 0.040;
  const titleH = titleSize * 1.55;
  const contentGap = minSide * 0.02;
  const contentX = pad;
  const contentY = pad + titleH + contentGap;
  const contentW = Math.max(1, width - (pad * 2));
  const contentH = Math.max(1, height - (pad * 2) - titleH - contentGap);
  const stages = (Array.isArray(exercise?.stages) ? exercise.stages : []).slice(0, 5);
  const labelUnits = 3.3;
  const boardGapUnits = 0.8;
  const rowGapUnits = 0.65;
  const boardMaxWUnits = 8;
  const boardHUnits = 5;
  const cell = Math.min(
    contentW / (labelUnits + boardGapUnits + boardMaxWUnits),
    contentH / ((stages.length * boardHUnits) + (Math.max(0, stages.length - 1) * rowGapUnits))
  );
  const rowH = boardHUnits * cell;
  const totalH = (stages.length * rowH) + (Math.max(0, stages.length - 1) * rowGapUnits * cell);
  let cursorY = contentY + ((contentH - totalH) / 2);
  const rows = stages.map((stage) => {
    const boardW = Number(stage?.width || 0) * cell;
    const row = {
      stage,
      label:`${stage?.width || ""}×${stage?.height || ""}`,
      labelX:contentX,
      labelY:cursorY,
      labelW:labelUnits * cell,
      rowH,
      boardX:contentX + (labelUnits * cell) + (boardGapUnits * cell),
      boardY:cursorY,
      boardW,
      boardH:rowH
    };
    cursorY += rowH + (rowGapUnits * cell);
    return row;
  });
  return {
    title:{ x:pad, y:pad, w:width - (pad * 2), h:titleH, size:titleSize },
    cell,
    rows
  };
}

function renderPentominoStageBoardSvg(stage, colorMap, x, y, cell){
  const placements = Array.isArray(stage?.solution) ? stage.solution : [];
  const parts = [
    `<rect class="dashboard-pentomino-board-border" x="${escapeAttr(x)}" y="${escapeAttr(y)}" width="${escapeAttr((stage?.width || 0) * cell)}" height="${escapeAttr((stage?.height || 0) * cell)}"></rect>`
  ];
  placements.forEach((placement) => {
    const color = colorMap.get(placement?.name) || PENTOMINO_CORRECTION_COLORS[0];
    const cells = Array.isArray(placement?.cells) ? placement.cells : [];
    const cellSet = new Set(cells.map(([cx,cy]) => `${cx},${cy}`));
    parts.push(...cells.map(([cx,cy]) => `<rect x="${escapeAttr(x + (cx * cell))}" y="${escapeAttr(y + (cy * cell))}" width="${escapeAttr(cell)}" height="${escapeAttr(cell)}" fill="${escapeAttr(color)}"></rect>`));
    const edges = [];
    for (const [cx,cy] of cells) {
      if (!cellSet.has(`${cx},${cy - 1}`)) edges.push([x + (cx * cell), y + (cy * cell), x + ((cx + 1) * cell), y + (cy * cell)]);
      if (!cellSet.has(`${cx + 1},${cy}`)) edges.push([x + ((cx + 1) * cell), y + (cy * cell), x + ((cx + 1) * cell), y + ((cy + 1) * cell)]);
      if (!cellSet.has(`${cx},${cy + 1}`)) edges.push([x + ((cx + 1) * cell), y + ((cy + 1) * cell), x + (cx * cell), y + ((cy + 1) * cell)]);
      if (!cellSet.has(`${cx - 1},${cy}`)) edges.push([x + (cx * cell), y + ((cy + 1) * cell), x + (cx * cell), y + (cy * cell)]);
    }
    parts.push(`<path class="dashboard-pentomino-board-piece" d="${edges.map(([x1,y1,x2,y2]) => `M${x1} ${y1}L${x2} ${y2}`).join(" ")}" stroke-width="${escapeAttr(Math.max(0.42, cell * 0.08))}"></path>`);
  });
  return parts.join("");
}

function renderPentominoCard(exercise, { showSolutions = false, slotWidth = 100, slotHeight = 100 } = {}){
  const pieces = Array.isArray(exercise?.pieces) ? exercise.pieces : [];
  const previewWidth = Math.max(1, Number(slotWidth) || 100);
  const previewHeight = Math.max(1, Number(slotHeight) || 100);
  if (showSolutions) {
    const layout = buildPentominoCorrectionLayout(exercise, previewWidth, previewHeight);
    const colorMap = getPentominoColorMap(pieces);
    return `
      <article class="dashboard-pentomino-card is-solution">
        <svg class="dashboard-pentomino-card-svg" viewBox="0 0 ${escapeAttr(previewWidth)} ${escapeAttr(previewHeight)}" role="img" aria-label="Correction du défi pentaminos">
          <text class="dashboard-pentomino-title-text" x="${escapeAttr(previewWidth / 2)}" y="${escapeAttr(layout.title.y + (layout.title.h / 2))}" text-anchor="middle" dominant-baseline="middle" font-size="${escapeAttr(layout.title.size)}">Correction</text>
          ${layout.rows.map((row) => `
            <text class="dashboard-pentomino-stage-label" x="${escapeAttr(row.labelX + row.labelW)}" y="${escapeAttr(row.labelY + (row.rowH / 2))}" text-anchor="end" dominant-baseline="middle" font-size="${escapeAttr(Math.max(2.7, layout.cell * 0.88))}">${escapeHtml(row.label)}</text>
            ${renderPentominoStageBoardSvg(row.stage, colorMap, row.boardX, row.boardY, layout.cell)}
          `).join("")}
        </svg>
      </article>`;
  }

  const layout = buildPentominoChallengeLayout(pieces, previewWidth, previewHeight);
  const rows = layout.rows.map((row) => {
    if (row.type === "first") {
      let cursorX = row.x;
      return row.pieces.map((piece) => {
        const pieceX = cursorX;
        const pieceY = row.y + ((row.h - (piece.height * layout.cell)) / 2);
        cursorX += (piece.width * layout.cell) + layout.pieceGap;
        return renderPentominoShapeSvg(piece, pieceX, pieceY, layout.cell);
      }).join("");
    }
    const piece = row.piece;
    const pieceX = row.x + layout.plusWidth + layout.plusGap;
    const pieceY = row.y + ((row.h - (piece.height * layout.cell)) / 2);
    const plusX = row.x + (layout.plusWidth / 2);
    const plusY = row.y + (row.h / 2);
    return `
      <text class="dashboard-pentomino-plus-text" x="${escapeAttr(plusX)}" y="${escapeAttr(plusY)}" text-anchor="middle" dominant-baseline="middle" font-size="${escapeAttr(layout.plusSize)}">+</text>
      ${renderPentominoShapeSvg(piece, pieceX, pieceY, layout.cell)}`;
  }).join("");

  return `
    <article class="dashboard-pentomino-card">
      <svg class="dashboard-pentomino-card-svg" viewBox="0 0 ${escapeAttr(previewWidth)} ${escapeAttr(previewHeight)}" role="img" aria-label="Défi pentaminos">
        <text class="dashboard-pentomino-title-text" x="${escapeAttr(previewWidth / 2)}" y="${escapeAttr(layout.title.y + (layout.title.h / 2))}" text-anchor="middle" dominant-baseline="middle" font-size="${escapeAttr(layout.title.size)}">Défi pentaminos</text>
        ${rows}
      </svg>
    </article>`;
}

function renderWorksheetSlot(exercise, index, layout, {
  generatorId,
  showSolutions = false,
  showSums = true,
  showWordList = true,
  slotWidth = 100,
  slotHeight = 100
} = {}){
  const column = index % layout.columns;
  const row = Math.floor(index / layout.columns);
  const classes = ["dashboard-worksheet-slot"];
  if (column < layout.columns - 1) classes.push("has-cut-right");
  if (row < layout.rows - 1) classes.push("has-cut-bottom");
  const card = generatorId === PENTOMINO_GENERATOR_ID
    ? renderPentominoCard(exercise, { showSolutions, slotWidth, slotHeight })
    : generatorId === WORD_SEARCH_GENERATOR_ID
      ? renderWordSearchCard(exercise, { showSolutions, showWordList })
      : generatorId === NUMBER_MYSTERY_GENERATOR_ID
        ? renderNumberMysteryCard(exercise, { showSolutions })
        : renderMagicSquareCard(exercise, { showSolutions, showSums });
  return `
    <div class="${classes.join(" ")}">
      ${card}
    </div>
  `;
}

function getWorksheetPrintMetrics(layout, landscape = false){
  const pageWidthMm = landscape ? 297 : 210;
  const pageHeightMm = landscape ? 210 : 297;
  const slotWidthMm = pageWidthMm / Math.max(1, Number(layout?.columns) || 1);
  const slotHeightMm = pageHeightMm / Math.max(1, Number(layout?.rows) || 1);
  const minSlotMm = Math.min(slotWidthMm, slotHeightMm);
  const mm = (value) => `${Number(value.toFixed(4))}mm`;

  return {
    slotWidthMm,
    slotHeightMm,
    magicSide:mm(minSlotMm),
    magicFont:mm(minSlotMm * 0.046),
    magicRow:mm(minSlotMm * 0.20),
    numberMysteryPadding:mm(minSlotMm * 0.05),
    numberMysteryGap:mm(minSlotMm * 0.022),
    numberMysteryTitleFont:mm(minSlotMm * 0.047),
    numberMysteryBoard:mm(Math.min(slotWidthMm * 0.44, slotHeightMm * 0.38)),
    numberMysteryCellFont:mm(minSlotMm * 0.056),
    numberMysteryColumnGap:mm(minSlotMm * 0.05),
    numberMysteryRowGap:mm(minSlotMm * 0.009),
    numberMysteryOperationsPadding:mm(minSlotMm * 0.02),
    numberMysteryOperationFont:mm(minSlotMm * 0.04),
    numberMysteryAnswerFont:mm(minSlotMm * 0.038)
  };
}

function renderWorksheetPages(exercises, {
  generatorId,
  perPage,
  showSolutions = false,
  showSums = true,
  showWordList = true,
  cutLines = false,
  landscape = false
} = {}){
  const safePerPage = normalizePerPage(perPage, generatorId);
  const layout = getWorksheetLayout(safePerPage, landscape);
  const printMetrics = getWorksheetPrintMetrics(layout, landscape);
  const printStyle = [
    `--worksheet-columns:${layout.columns}`,
    `--worksheet-rows:${layout.rows}`,
    `--print-magic-side:${printMetrics.magicSide}`,
    `--print-magic-font:${printMetrics.magicFont}`,
    `--print-magic-row:${printMetrics.magicRow}`,
    `--print-nm-padding:${printMetrics.numberMysteryPadding}`,
    `--print-nm-gap:${printMetrics.numberMysteryGap}`,
    `--print-nm-title-font:${printMetrics.numberMysteryTitleFont}`,
    `--print-nm-board:${printMetrics.numberMysteryBoard}`,
    `--print-nm-cell-font:${printMetrics.numberMysteryCellFont}`,
    `--print-nm-column-gap:${printMetrics.numberMysteryColumnGap}`,
    `--print-nm-row-gap:${printMetrics.numberMysteryRowGap}`,
    `--print-nm-operations-padding:${printMetrics.numberMysteryOperationsPadding}`,
    `--print-nm-operation-font:${printMetrics.numberMysteryOperationFont}`,
    `--print-nm-answer-font:${printMetrics.numberMysteryAnswerFont}`
  ].join("; ");
  const pages = paginateWorksheetItems(exercises, safePerPage);
  return pages.map((pageExercises, pageIndex) => `
    <section
      class="dashboard-worksheet-page ${cutLines ? "has-cut-lines" : ""} ${landscape ? "is-landscape" : ""}"
      data-per-page="${escapeAttr(safePerPage)}"
      style="${printStyle};"
      aria-label="Page ${pageIndex + 1}"
    >
      <div class="dashboard-worksheet-page-grid">
        ${pageExercises.map((exercise, index) => renderWorksheetSlot(exercise, index, layout, {
          generatorId,
          showSolutions,
          showSums,
          showWordList,
          slotWidth:printMetrics.slotWidthMm,
          slotHeight:printMetrics.slotHeightMm
        })).join("")}
      </div>
    </section>
  `).join("");
}

function renderCommonSettings(config, { collapsed = false, generatorId = "" } = {}){
  const perPage = normalizePerPage(config.perPage, generatorId);
  const pageCount = clampInteger(config.pageCount, 1, 20, 1);
  return `
    <section class="dashboard-worksheet-settings-group dashboard-worksheet-common-settings${collapsed ? " is-collapsed" : ""}">
      <button class="dashboard-worksheet-settings-heading" type="button" data-generator-action="toggle-common-settings" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "Afficher les paramètres généraux" : "Masquer les paramètres généraux"}">
        <h3>Paramètres généraux</h3>
        <span class="dashboard-material-icon" aria-hidden="true">${collapsed ? "expand_more" : "expand_less"}</span>
      </button>
      <label class="dashboard-worksheet-toggle-row">
        <span>Générer des exercices différents</span>
        <span class="dashboard-toggle">
          <input data-generator-field="different-exercises" type="checkbox" ${config.differentExercises ? "checked" : ""}>
          <span class="dashboard-toggle-track" aria-hidden="true"></span>
        </span>
      </label>

      <div class="dashboard-worksheet-stepper-row">
        <span class="dashboard-worksheet-stepper-label">Exercices par page</span>
        ${renderPerPageStepper(perPage, generatorId)}
      </div>

      ${renderStepperField({
        id:"worksheet-page-count",
        label:"Nombre de pages",
        value:pageCount,
        inputMin:1,
        inputMax:20,
        step:1,
        fieldClassName:"tv-stepper-field-inline dashboard-worksheet-stepper-field"
      })}

      <label class="dashboard-worksheet-toggle-row">
        <span>Traits de découpe</span>
        <span class="dashboard-toggle">
          <input data-generator-field="cut-lines" type="checkbox" ${config.cutLines ? "checked" : ""}>
          <span class="dashboard-toggle-track" aria-hidden="true"></span>
        </span>
      </label>

      <div class="dashboard-worksheet-toggle-row dashboard-worksheet-orientation-row ${generatorId === WORD_SEARCH_GENERATOR_ID ? "is-forced" : ""}" role="group" aria-label="Orientation de la feuille">
        <span>Orientation</span>
        <span class="dashboard-worksheet-orientation-choice">
          <span class="dashboard-worksheet-orientation-option ${config.landscape ? "" : "is-active"}">Portrait</span>
          <label class="dashboard-toggle">
            <input data-generator-field="landscape" type="checkbox" ${config.landscape ? "checked" : ""} ${generatorId === WORD_SEARCH_GENERATOR_ID ? "disabled" : ""} aria-label="Format paysage">
            <span class="dashboard-toggle-track" aria-hidden="true"></span>
          </label>
          <span class="dashboard-worksheet-orientation-option ${config.landscape ? "is-active" : ""}">Paysage</span>
        </span>
      </div>
    </section>
  `;
}

function renderMagicSquareSettings(config){
  return `
    <section class="dashboard-worksheet-settings-group">
      <h3>Paramètres de l'exercice</h3>
      ${renderStepperField({
        id:"worksheet-magic-sum",
        label:"Somme magique",
        value:config.sum,
        inputMin:15,
        inputMax:999,
        step:3,
        fieldClassName:"tv-stepper-field-inline dashboard-worksheet-stepper-field"
      })}

      ${renderStepperField({
        id:"worksheet-magic-given-count",
        label:"Cases données",
        value:config.givenCount,
        inputMin:3,
        inputMax:6,
        step:1,
        fieldClassName:"tv-stepper-field-inline dashboard-worksheet-stepper-field"
      })}

      <label class="dashboard-worksheet-toggle-row">
        <span>Afficher la somme autour du carré</span>
        <span class="dashboard-toggle">
          <input data-generator-field="show-sums" type="checkbox" ${config.showSums ? "checked" : ""}>
          <span class="dashboard-toggle-track" aria-hidden="true"></span>
        </span>
      </label>
    </section>
  `;
}

function renderNumberMysteryRange({ label, idPrefix, minValue, maxValue }){
  return `
    <div class="dashboard-number-mystery-range-field">
      <span class="dashboard-number-mystery-range-label">${escapeHtml(label)}</span>
      ${renderBasicMinMax({
        idPrefix,
        minLabel:"De",
        maxLabel:"À",
        minValue,
        maxValue,
        inputMin:0,
        inputMax:999,
        step:1
      })}
    </div>
  `;
}

function renderNumberMysterySettings(config){
  const resultFormSelected = config.calculationForm === "result" || config.calculationForm === "mixed";
  const missingFormSelected = config.calculationForm === "missing" || config.calculationForm === "mixed";
  return `
    <section class="dashboard-worksheet-settings-group dashboard-number-mystery-settings">
      <h3>Paramètres de l'exercice</h3>

      ${renderNumberMysteryRange({
        label:"Nombres à trouver",
        idPrefix:"worksheet-number-mystery-target",
        minValue:config.targetMin,
        maxValue:config.targetMax
      })}

      ${renderNumberMysteryRange({
        label:"Nombres dans les calculs",
        idPrefix:"worksheet-number-mystery-operand",
        minValue:config.operandMin,
        maxValue:config.operandMax
      })}

      <div class="dashboard-number-mystery-operations-field">
        <span class="dashboard-number-mystery-range-label">Opérations</span>
        <div class="dashboard-number-mystery-operation-grid">
          <label class="tv-radio-row dashboard-number-mystery-operation-pill${config.useAdd ? " is-selected" : ""}">
            <input class="tv-radio" data-number-mystery-operation="add" type="checkbox" ${config.useAdd ? "checked" : ""} aria-label="Autoriser l’addition">
            <span>Addition</span>
          </label>
          <label class="tv-radio-row dashboard-number-mystery-operation-pill${config.useSub ? " is-selected" : ""}">
            <input class="tv-radio" data-number-mystery-operation="sub" type="checkbox" ${config.useSub ? "checked" : ""} aria-label="Autoriser la soustraction">
            <span>Soustraction</span>
          </label>
          <label class="tv-radio-row dashboard-number-mystery-operation-pill${config.useMul ? " is-selected" : ""}">
            <input class="tv-radio" data-number-mystery-operation="mul" type="checkbox" ${config.useMul ? "checked" : ""} aria-label="Autoriser la multiplication">
            <span>Multiplication</span>
          </label>
          <label class="tv-radio-row dashboard-number-mystery-operation-pill${config.useDiv ? " is-selected" : ""}">
            <input class="tv-radio" data-number-mystery-operation="div" type="checkbox" ${config.useDiv ? "checked" : ""} aria-label="Autoriser la division">
            <span>Division</span>
          </label>
        </div>
      </div>

      <div class="dashboard-number-mystery-form-field">
        <span class="dashboard-number-mystery-range-label">Forme des calculs</span>
        <div class="dashboard-number-mystery-form-options">
          <label class="tv-radio-row dashboard-number-mystery-form-pill${resultFormSelected ? " is-selected" : ""}">
            <input class="tv-radio" data-number-mystery-form="result" type="checkbox" ${resultFormSelected ? "checked" : ""} aria-label="Autoriser les résultats à trouver">
            <span>Résultat à trouver</span>
          </label>
          <label class="tv-radio-row dashboard-number-mystery-form-pill${missingFormSelected ? " is-selected" : ""}">
            <input class="tv-radio" data-number-mystery-form="missing" type="checkbox" ${missingFormSelected ? "checked" : ""} aria-label="Autoriser les nombres manquants">
            <span>Nombre manquant</span>
          </label>
        </div>
      </div>
    </section>
  `;
}

function renderWordSearchSettings(config){
  return `
    <section class="dashboard-worksheet-settings-group dashboard-word-search-settings">
      <h3>Paramètres de l'exercice</h3>
      <button class="btn dashboard-word-search-source-button" type="button" data-word-search-action="source">
        <span>Source des mots</span>
        <span class="dashboard-material-icon" aria-hidden="true">chevron_right</span>
      </button>
      ${renderStepperField({ id:"worksheet-word-search-grid-size", label:"Taille de la grille", value:config.gridSize, inputMin:6, inputMax:18, step:1, fieldClassName:"tv-stepper-field-inline dashboard-worksheet-stepper-field" })}
      <div class="dashboard-word-search-directions-field">
        <span class="dashboard-word-search-directions-label">Orientation des mots</span>
        <div class="dashboard-word-search-directions-grid">
          ${WORD_SEARCH_DIRECTION_OPTIONS.map((option) => `
            <label class="tv-radio-row dashboard-word-search-direction-option${config.directions.includes(option.id) ? " is-selected" : ""}" title="${escapeAttr(option.label)}">
              <input class="tv-radio" data-word-search-direction="${escapeAttr(option.id)}" type="checkbox" ${config.directions.includes(option.id) ? "checked" : ""} aria-label="${escapeAttr(option.label)}">
              <span class="dashboard-material-icon dashboard-word-search-direction-icon" aria-hidden="true">${option.icon}</span>
            </label>
          `).join("")}
        </div>
      </div>
      <label class="dashboard-worksheet-toggle-row">
        <span>Afficher la liste des mots</span>
        <span class="dashboard-toggle"><input data-generator-field="show-word-list" type="checkbox" ${config.showWordList ? "checked" : ""}><span class="dashboard-toggle-track" aria-hidden="true"></span></span>
      </label>
    </section>
  `;
}


function renderPentominoSettings(config){
  return `
    <section class="dashboard-worksheet-settings-group dashboard-pentomino-settings">
      <h3>Matériel</h3>
      <button class="btn dashboard-pentomino-material-button" type="button" data-pentomino-action="material">
        <span>Imprimer les grilles et les pièces</span>
        <span class="dashboard-material-icon" aria-hidden="true">chevron_right</span>
      </button>
    </section>`;
}

export function createWorksheetGeneratorViewController({
  view,
  host,
  showToast,
  loadSettings,
  saveSettings,
  onBack
} = {}){
  let isOpen = false;
  let generatorId = "";
  let config = getDefaultConfig(MAGIC_SQUARE_GENERATOR_ID);
  let worksheet = buildMagicSquareWorksheet(config);
  let showSolutions = false;
  let commonSettingsCollapsed = true;
  let previewZoom = null;
  let previewFitZoom = 1;
  let previewResizeObserver = null;
  let settingsSaveTimer = null;
  let pendingSettingsSave = null;
  let configEditRevision = 0;
  let openRevision = 0;
  const lastPersistedSettingsByGenerator = new Map();

  function getTitleElement(){
    return view?.querySelector?.(".dashboard-section-title") || null;
  }

  function setOpenState(nextOpen){
    isOpen = nextOpen === true;
    view?.classList.toggle("is-worksheet-generator-open", isOpen);
    const title = getTitleElement();
    if (title) title.textContent = "Ressources";
  }

  function normalizeCurrentConfig(){
    config.perPage = normalizePerPage(config.perPage, generatorId);
    config.pageCount = clampInteger(config.pageCount, 1, 20, 1);
    config.cutLines = config.cutLines === true;
    config.landscape = config.landscape === true;
    config.differentExercises = config.differentExercises !== false;

    if (generatorId === WORD_SEARCH_GENERATOR_ID) {
      config.perPage = normalizePerPage(config.perPage, generatorId);
      config.sourceType = "custom";
      config.landscape = getWordSearchLandscape(config.perPage);
      config.gridSize = clampInteger(config.gridSize, 6, 18, 10);
      config.directions = normalizeWordSearchDirections(config.directions, config.difficulty);
      config.showWordList = config.showWordList !== false;
      return;
    }

    if (generatorId === PENTOMINO_GENERATOR_ID) {
      config.materialCellSizeMm = clampInteger(config.materialCellSizeMm, 10, 20, 20);
      config.materialDuplex = config.materialDuplex === true;
      config.materialVersoOffsetXmm = clampInteger(config.materialVersoOffsetXmm, -20, 20, 0);
      config.materialVersoOffsetYmm = clampInteger(config.materialVersoOffsetYmm, -20, 20, 0);
      return;
    }

    if (generatorId === NUMBER_MYSTERY_GENERATOR_ID) {
      config.targetMin = clampInteger(config.targetMin, 0, 999, 80);
      config.targetMax = clampInteger(config.targetMax, 0, 999, 89);
      config.operandMin = clampInteger(config.operandMin, 0, 999, 20);
      config.operandMax = clampInteger(config.operandMax, 0, 999, 70);
      config.calculationForm = ["result", "missing", "mixed"].includes(config.calculationForm)
        ? config.calculationForm
        : "result";
      return;
    }

    config.sum = normalizeMagicSum(config.sum);
    config.givenCount = clampInteger(config.givenCount, 3, 6, 3);
    config.showSums = config.showSums !== false;
  }

  function getCurrentPersistableConfig(){
    return getPersistableConfig(generatorId, config);
  }

  function clearSettingsSaveTimer(){
    if (settingsSaveTimer !== null) {
      window.clearTimeout(settingsSaveTimer);
      settingsSaveTimer = null;
    }
  }

  async function flushPendingSettingsSave(){
    clearSettingsSaveTimer();
    const pending = pendingSettingsSave;
    pendingSettingsSave = null;
    if (!pending || typeof saveSettings !== "function") return;

    const lastPersisted = lastPersistedSettingsByGenerator.get(pending.generatorId);
    if (lastPersisted === pending.serialized) return;

    try {
      await saveSettings(pending.generatorId, pending.settings, { version:GENERATOR_SETTINGS_VERSION });
      lastPersistedSettingsByGenerator.set(pending.generatorId, pending.serialized);
    } catch (error) {
      console.warn("Sauvegarde des réglages du générateur impossible.", error);
      showToast?.("Impossible de sauvegarder les réglages du générateur.", { isError:true });
    }
  }

  function scheduleSettingsSave(){
    if (!generatorId || typeof saveSettings !== "function") return;
    normalizeCurrentConfig();
    const settings = getCurrentPersistableConfig();
    const serialized = JSON.stringify(settings);
    if (lastPersistedSettingsByGenerator.get(generatorId) === serialized) {
      pendingSettingsSave = null;
      clearSettingsSaveTimer();
      return;
    }

    pendingSettingsSave = {
      generatorId,
      settings:{ ...settings },
      serialized
    };
    clearSettingsSaveTimer();
    settingsSaveTimer = window.setTimeout(() => {
      void flushPendingSettingsSave();
    }, GENERATOR_SETTINGS_SAVE_DELAY_MS);
  }

  async function hydrateSavedSettings(requestedGeneratorId, requestedOpenRevision, requestedEditRevision){
    if (typeof loadSettings !== "function") return;
    try {
      const saved = await loadSettings(requestedGeneratorId);
      if (
        requestedOpenRevision !== openRevision
        || !isOpen
        || generatorId !== requestedGeneratorId
        || configEditRevision !== requestedEditRevision
      ) return;

      if (!saved?.settings || typeof saved.settings !== "object" || Array.isArray(saved.settings)) {
        lastPersistedSettingsByGenerator.set(
          requestedGeneratorId,
          serializePersistableConfig(requestedGeneratorId, getDefaultConfig(requestedGeneratorId))
        );
        return;
      }

      if (Number(saved.version || 1) !== GENERATOR_SETTINGS_VERSION) {
        console.warn("Version de réglages de générateur non prise en charge.", saved.version);
        return;
      }

      config = {
        ...getDefaultConfig(requestedGeneratorId),
        ...getPersistableConfig(requestedGeneratorId, saved.settings)
      };
      normalizeCurrentConfig();
      lastPersistedSettingsByGenerator.set(
        requestedGeneratorId,
        serializePersistableConfig(requestedGeneratorId, config)
      );
      if (requestedGeneratorId === WORD_SEARCH_GENERATOR_ID) config.resolvedWords = config.sourceWords;
      worksheet = buildWorksheet(requestedGeneratorId, config);
      render();
    } catch (error) {
      console.warn("Chargement des réglages du générateur impossible.", error);
    }
  }

  function regenerate(){
    try {
      normalizeCurrentConfig();
      if (generatorId === WORD_SEARCH_GENERATOR_ID) config.resolvedWords = config.sourceWords;
      worksheet = buildWorksheet(generatorId, config);
      renderPreview();
    } catch (error) {
      console.error("Génération de fiche impossible.", error);
      showToast?.(error?.message || "Génération impossible.", { isError:true });
    }
  }

  function renderSettings(){
    const specific = generatorId === PENTOMINO_GENERATOR_ID
      ? renderPentominoSettings(config)
      : generatorId === WORD_SEARCH_GENERATOR_ID
        ? renderWordSearchSettings(config)
        : generatorId === NUMBER_MYSTERY_GENERATOR_ID
          ? renderNumberMysterySettings(config)
          : renderMagicSquareSettings(config);
    return `
      <div class="dashboard-worksheet-sidebar-scroll">
        ${renderCommonSettings(config, { collapsed:commonSettingsCollapsed, generatorId })}
        ${specific}
      </div>
    `;
  }

  function getGeneratorTitle(){
    if (generatorId === PENTOMINO_GENERATOR_ID) return "Défis pentaminos";
    if (generatorId === WORD_SEARCH_GENERATOR_ID) return "Mots mêlés";
    return generatorId === NUMBER_MYSTERY_GENERATOR_ID ? "Nombre mystérieux" : "Carré magique";
  }

  function renderPreview(){
    const pages = host?.querySelector?.(".dashboard-worksheet-preview-pages");
    if (!pages) {
      render();
      return;
    }

    pages.innerHTML = renderWorksheetPages(worksheet.exercises, {
      generatorId,
      perPage:normalizePerPage(config.perPage, generatorId),
      showSolutions,
      showSums:config.showSums,
      showWordList:config.showWordList,
      cutLines:config.cutLines,
      landscape:config.landscape
    });
    window.requestAnimationFrame(updatePreviewZoom);
  }

  function render(){
    if (!host || !isOpen) return;
    host.classList.remove("dashboard-explorer-host");
    const perPage = normalizePerPage(config.perPage, generatorId);
    host.innerHTML = `
      <div class="dashboard-worksheet-generator-view">
        <aside class="dashboard-worksheet-sidebar">
          <div class="dashboard-worksheet-sidebar-header">
            <button class="btn dashboard-btn-with-icon dashboard-worksheet-back" type="button" data-generator-action="back" aria-label="Retour aux générateurs" title="Retour aux générateurs">
              <span class="dashboard-material-icon" aria-hidden="true">arrow_back</span>
            </button>
            <div class="dashboard-worksheet-sidebar-title">
              <strong>${escapeHtml(getGeneratorTitle())}</strong>
            </div>
          </div>

          ${renderSettings()}

          <div class="dashboard-worksheet-sidebar-actions">
            <div class="dashboard-worksheet-sidebar-actions-main">
              <button class="btn dashboard-btn-with-icon dashboard-worksheet-regenerate" type="button" data-generator-action="regenerate">
                <span class="dashboard-material-icon" aria-hidden="true">refresh</span>
                <span>Régénérer</span>
              </button>
              <button class="btn dashboard-btn-with-icon ${showSolutions ? "primary" : ""}" type="button" data-generator-action="toggle-solution" aria-pressed="${showSolutions}">
                <span class="dashboard-material-icon" aria-hidden="true">${showSolutions ? "visibility_off" : "visibility"}</span>
                <span>${showSolutions ? "Voir la fiche élève" : "Correction"}</span>
              </button>
            </div>
            <button class="btn primary dashboard-btn-with-icon" type="button" data-generator-action="pdf">
              <span class="dashboard-material-icon" aria-hidden="true">picture_as_pdf</span>
              <span>Télécharger le PDF</span>
            </button>
          </div>
        </aside>

        <main class="dashboard-worksheet-preview-panel" aria-label="Aperçu A4">
          <div class="dashboard-worksheet-preview-scroll">
            <div class="dashboard-worksheet-preview-stage-sizer">
              <div class="dashboard-worksheet-preview-stage">
                <div class="dashboard-worksheet-preview-pages">
                  ${renderWorksheetPages(worksheet.exercises, {
                    generatorId,
                    perPage,
                    showSolutions,
                    showSums:config.showSums,
                    showWordList:config.showWordList,
                    cutLines:config.cutLines,
                    landscape:config.landscape
                  })}
                </div>
              </div>
            </div>
          </div>
          <div class="dashboard-worksheet-preview-zoom" role="toolbar" aria-label="Zoom de l’aperçu">
            <button class="dashboard-worksheet-preview-zoom-button" type="button" data-preview-zoom-action="out" aria-label="Réduire le zoom" title="Réduire le zoom">
              <span class="dashboard-material-icon" aria-hidden="true">zoom_out</span>
            </button>
            <button class="dashboard-worksheet-preview-zoom-value" type="button" data-preview-zoom-action="fit" title="Ajuster la feuille à l’écran">
              <span data-preview-zoom-value>100 %</span>
              <span class="dashboard-material-icon" aria-hidden="true">fit_screen</span>
            </button>
            <button class="dashboard-worksheet-preview-zoom-button" type="button" data-preview-zoom-action="in" aria-label="Agrandir le zoom" title="Agrandir le zoom">
              <span class="dashboard-material-icon" aria-hidden="true">zoom_in</span>
            </button>
          </div>
        </main>
      </div>
    `;
    bindRenderedEvents();
    bindPreviewZoom();
  }

  function updateCommonConfigFromControls(){
    const differentExercisesInput = host.querySelector('[data-generator-field="different-exercises"]');
    const perPageInput = host.querySelector("#worksheet-per-page");
    const pageCountInput = host.querySelector("#worksheet-page-count");
    const cutLinesInput = host.querySelector('[data-generator-field="cut-lines"]');
    const landscapeInput = host.querySelector('[data-generator-field="landscape"]');
    config = {
      ...config,
      differentExercises:differentExercisesInput?.checked !== false,
      perPage:normalizePerPage(perPageInput?.value, generatorId),
      pageCount:clampInteger(pageCountInput?.value, 1, 20, 1),
      cutLines:cutLinesInput?.checked === true,
      landscape:generatorId === WORD_SEARCH_GENERATOR_ID
        ? getWordSearchLandscape(normalizePerPage(perPageInput?.value, generatorId))
        : landscapeInput?.checked === true
    };
  }

  function updateMagicSquareConfigFromControls(){
    const sumInput = host.querySelector("#worksheet-magic-sum");
    const givenCountInput = host.querySelector("#worksheet-magic-given-count");
    const showSumsInput = host.querySelector('[data-generator-field="show-sums"]');
    config = {
      ...config,
      sum:normalizeMagicSum(sumInput?.value),
      givenCount:clampInteger(givenCountInput?.value, 3, 6, 3),
      showSums:showSumsInput?.checked !== false
    };
  }

  function updateNumberMysteryConfigFromControls(){
    const operationChecked = (kind) => host.querySelector(`[data-number-mystery-operation="${kind}"]`)?.checked === true;
    const formChecked = (kind) => host.querySelector(`[data-number-mystery-form="${kind}"]`)?.checked === true;
    const useResultForm = formChecked("result");
    const useMissingForm = formChecked("missing");
    config = {
      ...config,
      targetMin:clampInteger(host.querySelector("#worksheet-number-mystery-target_min")?.value, 0, 999, 80),
      targetMax:clampInteger(host.querySelector("#worksheet-number-mystery-target_max")?.value, 0, 999, 89),
      operandMin:clampInteger(host.querySelector("#worksheet-number-mystery-operand_min")?.value, 0, 999, 20),
      operandMax:clampInteger(host.querySelector("#worksheet-number-mystery-operand_max")?.value, 0, 999, 70),
      useAdd:operationChecked("add"),
      useSub:operationChecked("sub"),
      useMul:operationChecked("mul"),
      useDiv:operationChecked("div"),
      calculationForm:useResultForm && useMissingForm ? "mixed" : useMissingForm ? "missing" : "result"
    };
  }

  function updateConfigFromControls({ regenerateContent = false } = {}){
    if (!host) return;
    const before = serializePersistableConfig(generatorId, config);
    updateCommonConfigFromControls();
    if (generatorId === PENTOMINO_GENERATOR_ID) {
      // Aucun réglage propre au défi : les paramètres généraux suffisent.
    } else if (generatorId === WORD_SEARCH_GENERATOR_ID) {
      config.gridSize = clampInteger(host.querySelector("#worksheet-word-search-grid-size")?.value, 6, 18, 10);
      const selectedDirections = [...host.querySelectorAll('[data-word-search-direction]:checked')].map((input) => input.dataset.wordSearchDirection);
      if (selectedDirections.length) config.directions = normalizeWordSearchDirections(selectedDirections);
      config.showWordList = host.querySelector('[data-generator-field="show-word-list"]')?.checked !== false;
    } else if (generatorId === NUMBER_MYSTERY_GENERATOR_ID) updateNumberMysteryConfigFromControls();
    else updateMagicSquareConfigFromControls();
    normalizeCurrentConfig();
    const after = serializePersistableConfig(generatorId, config);
    if (after !== before) {
      configEditRevision += 1;
      scheduleSettingsSave();
    }

    if (regenerateContent) regenerate();
    else render();
  }

  function cleanupPreviewObserver(){
    previewResizeObserver?.disconnect?.();
    previewResizeObserver = null;
  }

  function updatePreviewZoom(){
    const previewScroll = host?.querySelector?.(".dashboard-worksheet-preview-scroll");
    const previewStage = host?.querySelector?.(".dashboard-worksheet-preview-stage");
    const previewSizer = host?.querySelector?.(".dashboard-worksheet-preview-stage-sizer");
    const zoomValue = host?.querySelector?.("[data-preview-zoom-value]");
    if (!previewScroll || !previewStage || !previewSizer || !zoomValue) return;

    const baseWidth = previewStage.offsetWidth;
    const baseHeight = previewStage.offsetHeight;
    const availableWidth = Math.max(1, previewScroll.clientWidth - 44);
    const availableHeight = Math.max(1, previewScroll.clientHeight - 44);
    if (!baseWidth || !baseHeight) return;

    previewFitZoom = Math.min(availableWidth / baseWidth, availableHeight / baseHeight);
    const effectiveZoom = previewZoom === null ? previewFitZoom : previewZoom;
    previewStage.style.setProperty("--dashboard-worksheet-preview-zoom", String(effectiveZoom));
    previewSizer.style.width = `${Math.ceil(baseWidth * effectiveZoom)}px`;
    previewSizer.style.height = `${Math.ceil(baseHeight * effectiveZoom)}px`;
    zoomValue.textContent = `${Math.round(effectiveZoom * 100)} %`;
    previewScroll.classList.toggle("is-zoomed", effectiveZoom > previewFitZoom + 0.001);
  }

  function bindPreviewZoom(){
    const previewScroll = host?.querySelector?.(".dashboard-worksheet-preview-scroll");
    if (!previewScroll) return;

    const changeZoom = (direction) => {
      const currentZoom = previewZoom === null ? previewFitZoom : previewZoom;
      const currentPercent = currentZoom * 100;
      const nearestTen = Math.round(currentPercent / 10) * 10;
      const isOnTenPercent = Math.abs(currentPercent - nearestTen) < 0.01;
      const nextPercent = isOnTenPercent
        ? nearestTen + (direction * 10)
        : direction > 0
          ? Math.ceil(currentPercent / 10) * 10
          : Math.floor(currentPercent / 10) * 10;
      previewZoom = Math.min(2.5, Math.max(0.1, nextPercent / 100));
      updatePreviewZoom();
    };

    host.querySelector('[data-preview-zoom-action="out"]')?.addEventListener("click", () => changeZoom(-1));
    host.querySelector('[data-preview-zoom-action="in"]')?.addEventListener("click", () => changeZoom(1));
    host.querySelector('[data-preview-zoom-action="fit"]')?.addEventListener("click", () => {
      previewZoom = null;
      previewScroll.scrollTo({ top:0, left:0 });
      updatePreviewZoom();
    });

    cleanupPreviewObserver();
    if (typeof ResizeObserver === "function") {
      previewResizeObserver = new ResizeObserver(() => updatePreviewZoom());
      previewResizeObserver.observe(previewScroll);
    }
    window.requestAnimationFrame(updatePreviewZoom);
  }

  function closeWordSourceOverlay(){
    host?.querySelector?.(".dashboard-word-search-source-overlay")?.remove?.();
  }

  function openWordSourceChooser(){
    closeWordSourceOverlay();
    const overlay = document.createElement("div");
    overlay.className = "dashboard-word-search-source-overlay";
    overlay.innerHTML = `
      <div class="dashboard-word-search-source-dialog" role="dialog" aria-modal="true" aria-label="Source des mots">
        <div class="dashboard-word-search-source-header">
          <span></span>
          <strong>Source des mots</strong>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-word-source-action="close"><span class="dashboard-material-icon" aria-hidden="true">close</span></button>
        </div>
        <div class="dashboard-word-search-source-content">
          <div class="dashboard-word-search-source-form">
            <div class="dashboard-word-search-source-field">
              <div class="dashboard-word-search-source-field-head">
                <label for="worksheet-word-search-source-text">Mots à cacher</label>
                <div class="dashboard-word-search-source-tools">
                  <span class="dashboard-word-search-word-count" data-word-source-count aria-live="polite">0 mot</span>
                  <button class="btn dashboard-word-search-clear-button" type="button" data-word-source-action="clear">
                    <span class="dashboard-material-icon" aria-hidden="true">delete_sweep</span>
                    <span>Vider</span>
                  </button>
                </div>
              </div>
              <textarea id="worksheet-word-search-source-text" class="tv-input dashboard-word-search-source-textarea" rows="12" data-word-source-text>${escapeHtml(String(config.sourceWords || "").toLocaleUpperCase("fr-FR"))}</textarea>
            </div>
            <p>Un mot par ligne. Les espaces, tirets et apostrophes sont ignorés dans la grille. Les accents des majuscules sont conservés.</p>
          </div>
        </div>
        <div class="dashboard-word-search-source-footer"><button class="btn primary" type="button" data-word-source-action="apply">Utiliser cette liste</button></div>
      </div>`;
    host?.querySelector?.(".dashboard-worksheet-generator-view")?.appendChild(overlay);
    const sourceTextarea = overlay.querySelector("[data-word-source-text]");
    const sourceCount = overlay.querySelector("[data-word-source-count]");
    const refreshWordCount = () => {
      const count = parseWordSearchWords(sourceTextarea?.value || "").length;
      if (sourceCount) sourceCount.textContent = `${count} ${count > 1 ? "mots" : "mot"}`;
    };
    refreshWordCount();
    sourceTextarea?.addEventListener("input", () => {
      if (sourceTextarea) {
        const start = sourceTextarea.selectionStart;
        const end = sourceTextarea.selectionEnd;
        const upper = sourceTextarea.value.toLocaleUpperCase("fr-FR");
        if (upper !== sourceTextarea.value) {
          sourceTextarea.value = upper;
          sourceTextarea.setSelectionRange(start, end);
        }
      }
      refreshWordCount();
    });
    overlay.querySelector('[data-word-source-action="clear"]')?.addEventListener("click", () => {
      if (!sourceTextarea) return;
      sourceTextarea.value = "";
      refreshWordCount();
      sourceTextarea.focus();
    });
    overlay.querySelector('[data-word-source-action="close"]')?.addEventListener("click", closeWordSourceOverlay);
    overlay.querySelector('[data-word-source-action="apply"]')?.addEventListener("click", () => {
      try {
        const raw = overlay.querySelector("[data-word-source-text]")?.value || "";
        const parsed = parseWordSearchWords(raw);
        if (parsed.length < 2) throw new Error("Ajoute au moins deux mots.");
        config = { ...config, sourceType:"custom", sourceWords:raw, resolvedWords:raw };
        closeWordSourceOverlay();
        configEditRevision += 1;
        scheduleSettingsSave();
        regenerate();
      } catch (error) {
        showToast?.(error?.message || "Liste de mots invalide.", { isError:true });
      }
    });
  }


  function closePentominoMaterialOverlay(){
    closePentominoVersoCalibrationOverlay();
    host?.querySelector?.(".dashboard-pentomino-material-overlay")?.remove?.();
  }

  function closePentominoVersoCalibrationOverlay(){
    host?.querySelector?.(".dashboard-pentomino-verso-calibration-overlay")?.remove?.();
  }

  function openPentominoVersoCalibrationOverlay(){
    closePentominoVersoCalibrationOverlay();
    const materialOverlay = host?.querySelector?.(".dashboard-pentomino-material-overlay");
    if (!materialOverlay) return;

    const calibrationOverlay = document.createElement("div");
    calibrationOverlay.className = "dashboard-pentomino-verso-calibration-overlay";
    calibrationOverlay.innerHTML = `
      <div class="dashboard-pentomino-verso-calibration-dialog" role="dialog" aria-modal="true" aria-label="Ajuster le décalage du verso">
        <div class="dashboard-pentomino-material-header">
          <span></span>
          <strong>Ajuster le verso</strong>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-verso-calibration-action="close" aria-label="Fermer"><span class="dashboard-material-icon" aria-hidden="true">close</span></button>
        </div>
        <div class="dashboard-pentomino-verso-calibration-content">
          <p>Chaque flèche décale tout le verso de 1 mm. Le rectangle pointillé matérialise la position d’origine.</p>
          <div class="dashboard-pentomino-verso-calibration-pad">
            <button class="dashboard-pentomino-verso-arrow is-up" type="button" data-verso-shift-y="-1" aria-label="Décaler le verso de 1 mm vers le haut"><span class="dashboard-material-icon" aria-hidden="true">arrow_upward</span></button>
            <button class="dashboard-pentomino-verso-arrow is-left" type="button" data-verso-shift-x="-1" aria-label="Décaler le verso de 1 mm vers la gauche"><span class="dashboard-material-icon" aria-hidden="true">arrow_back</span></button>
            <div class="dashboard-pentomino-verso-sheet-stage" aria-label="Simulation du décalage du verso">
              <div class="dashboard-pentomino-verso-sheet-origin" aria-hidden="true"></div>
              <div class="dashboard-pentomino-verso-sheet-moving" aria-hidden="true"></div>
            </div>
            <button class="dashboard-pentomino-verso-arrow is-right" type="button" data-verso-shift-x="1" aria-label="Décaler le verso de 1 mm vers la droite"><span class="dashboard-material-icon" aria-hidden="true">arrow_forward</span></button>
            <button class="dashboard-pentomino-verso-arrow is-down" type="button" data-verso-shift-y="1" aria-label="Décaler le verso de 1 mm vers le bas"><span class="dashboard-material-icon" aria-hidden="true">arrow_downward</span></button>
          </div>
          <div class="dashboard-pentomino-verso-values">
            <span>Horizontal : <strong data-verso-offset-x></strong></span>
            <span>Vertical : <strong data-verso-offset-y></strong></span>
          </div>
          <button class="btn dashboard-btn-with-icon dashboard-pentomino-verso-reset" type="button" data-verso-calibration-action="reset">
            <span class="dashboard-material-icon" aria-hidden="true">restart_alt</span>
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>`;
    materialOverlay.appendChild(calibrationOverlay);

    const formatMm = (value) => {
      const numeric = Number(value) || 0;
      return `${numeric > 0 ? "+" : ""}${numeric} mm`;
    };
    const refreshCalibration = () => {
      config.materialVersoOffsetXmm = clampInteger(config.materialVersoOffsetXmm, -20, 20, 0);
      config.materialVersoOffsetYmm = clampInteger(config.materialVersoOffsetYmm, -20, 20, 0);
      const moving = calibrationOverlay.querySelector(".dashboard-pentomino-verso-sheet-moving");
      moving?.style.setProperty("--verso-offset-x", `${config.materialVersoOffsetXmm * 3}px`);
      moving?.style.setProperty("--verso-offset-y", `${config.materialVersoOffsetYmm * 3}px`);
      const xValue = calibrationOverlay.querySelector("[data-verso-offset-x]");
      const yValue = calibrationOverlay.querySelector("[data-verso-offset-y]");
      if (xValue) xValue.textContent = formatMm(config.materialVersoOffsetXmm);
      if (yValue) yValue.textContent = formatMm(config.materialVersoOffsetYmm);
    };
    const persistCalibration = () => {
      configEditRevision += 1;
      scheduleSettingsSave();
      refreshCalibration();
    };

    calibrationOverlay.querySelectorAll("[data-verso-shift-x]").forEach((button) => {
      button.addEventListener("click", () => {
        config.materialVersoOffsetXmm = clampInteger(config.materialVersoOffsetXmm + Number(button.dataset.versoShiftX || 0), -20, 20, 0);
        persistCalibration();
      });
    });
    calibrationOverlay.querySelectorAll("[data-verso-shift-y]").forEach((button) => {
      button.addEventListener("click", () => {
        config.materialVersoOffsetYmm = clampInteger(config.materialVersoOffsetYmm + Number(button.dataset.versoShiftY || 0), -20, 20, 0);
        persistCalibration();
      });
    });
    calibrationOverlay.querySelector('[data-verso-calibration-action="reset"]')?.addEventListener("click", () => {
      config.materialVersoOffsetXmm = 0;
      config.materialVersoOffsetYmm = 0;
      persistCalibration();
    });
    calibrationOverlay.querySelector('[data-verso-calibration-action="close"]')?.addEventListener("click", closePentominoVersoCalibrationOverlay);
    calibrationOverlay.addEventListener("click", (event) => {
      if (event.target === calibrationOverlay) closePentominoVersoCalibrationOverlay();
    });
    refreshCalibration();
  }

  function openPentominoMaterialOverlay(){
    closePentominoMaterialOverlay();
    const overlay = document.createElement("div");
    overlay.className = "dashboard-pentomino-material-overlay";
    overlay.innerHTML = `
      <div class="dashboard-pentomino-material-dialog" role="dialog" aria-modal="true" aria-label="Matériel pentaminos à imprimer">
        <div class="dashboard-pentomino-material-header">
          <span></span>
          <strong>Matériel pentaminos</strong>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-pentomino-material-action="close" aria-label="Fermer"><span class="dashboard-material-icon" aria-hidden="true">close</span></button>
        </div>
        <div class="dashboard-pentomino-material-content">
          <p>La taille choisie correspond à la taille réelle d’une case à l’impression. Imprimer le PDF à 100 % / taille réelle.</p>
          ${renderStepperField({
            id:"worksheet-pentomino-material-size",
            label:"Taille d’une case (mm)",
            value:clampInteger(config.materialCellSizeMm, 10, 20, 20),
            inputMin:10,
            inputMax:20,
            step:1,
            fieldClassName:"tv-stepper-field-inline dashboard-worksheet-stepper-field"
          })}
          <div class="dashboard-pentomino-material-downloads">
            <button class="btn dashboard-btn-with-icon" type="button" data-pentomino-material-download="grids">
              <span class="dashboard-material-icon" aria-hidden="true">grid_on</span>
              <span>Grilles 4 → 8 pièces</span>
            </button>
            <div class="dashboard-pentomino-pieces-download">
              <button class="btn dashboard-btn-with-icon" type="button" data-pentomino-material-download="pieces">
                <span class="dashboard-material-icon" aria-hidden="true">extension</span>
                <span>12 pentaminos à découper</span>
              </button>
              <div class="dashboard-pentomino-duplex-controls">
                <label class="dashboard-worksheet-toggle-row dashboard-pentomino-duplex-toggle">
                  <span>Recto/verso</span>
                  <span class="dashboard-toggle">
                    <input data-pentomino-material-duplex type="checkbox" ${config.materialDuplex ? "checked" : ""}>
                    <span class="dashboard-toggle-track" aria-hidden="true"></span>
                  </span>
                </label>
                <button class="btn dashboard-btn-with-icon dashboard-pentomino-verso-calibration-button" type="button" data-pentomino-material-action="calibrate-verso" ${config.materialDuplex ? "" : "disabled"}>
                  <span class="dashboard-material-icon" aria-hidden="true">tune</span>
                  <span>Ajuster le verso</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    host?.querySelector?.(".dashboard-worksheet-generator-view")?.appendChild(overlay);

    const persistSize = () => {
      const input = overlay.querySelector("#worksheet-pentomino-material-size");
      config.materialCellSizeMm = clampInteger(input?.value, 10, 20, 20);
      configEditRevision += 1;
      scheduleSettingsSave();
    };
    bindStepperField(overlay, "worksheet-pentomino-material-size", {
      inputMin:10,
      inputMax:20,
      onChange:persistSize
    });
    overlay.querySelector('[data-pentomino-material-action="close"]')?.addEventListener("click", closePentominoMaterialOverlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePentominoMaterialOverlay();
    });
    overlay.querySelector("[data-pentomino-material-duplex]")?.addEventListener("change", (event) => {
      config.materialDuplex = event.currentTarget.checked === true;
      const calibrationButton = overlay.querySelector('[data-pentomino-material-action="calibrate-verso"]');
      if (calibrationButton) calibrationButton.disabled = !config.materialDuplex;
      if (!config.materialDuplex) closePentominoVersoCalibrationOverlay();
      configEditRevision += 1;
      scheduleSettingsSave();
    });
    overlay.querySelector('[data-pentomino-material-action="calibrate-verso"]')?.addEventListener("click", () => {
      if (config.materialDuplex) openPentominoVersoCalibrationOverlay();
    });
    overlay.querySelectorAll("[data-pentomino-material-download]").forEach((button) => {
      button.addEventListener("click", async () => {
        persistSize();
        try {
          button.disabled = true;
          await downloadPentominoMaterialPdf({
            type:button.dataset.pentominoMaterialDownload,
            cellSizeMm:config.materialCellSizeMm,
            rectoVerso:button.dataset.pentominoMaterialDownload === "pieces" && config.materialDuplex === true,
            versoOffsetXmm:config.materialVersoOffsetXmm,
            versoOffsetYmm:config.materialVersoOffsetYmm
          });
        } catch (error) {
          console.error("Génération du matériel pentaminos impossible.", error);
          showToast?.(error?.message || "Impossible de générer le matériel.", { isError:true });
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  async function downloadPdfCurrent(){
    const button = host?.querySelector?.('[data-generator-action="pdf"]');
    const label = button?.querySelector?.("span:last-child");
    if (button?.disabled) return;

    try {
      if (button) button.disabled = true;
      if (label) label.textContent = "Génération…";
      await downloadWorksheetPdf({
        generatorId,
        exercises:worksheet.exercises,
        perPage:normalizePerPage(config.perPage, generatorId),
        showSolutions,
        showSums:config.showSums,
        showWordList:config.showWordList,
        cutLines:config.cutLines,
        landscape:config.landscape
      });
    } catch (error) {
      console.error("Génération du PDF impossible.", error);
      showToast?.(error?.message || "Impossible de générer le PDF.", { isError:true });
    } finally {
      if (button) button.disabled = false;
      if (label) label.textContent = "Télécharger le PDF";
    }
  }
  function bindRenderedEvents(){
    if (!host) return;
    host.querySelector('[data-generator-action="back"]')?.addEventListener("click", () => close());
    host.querySelector('[data-generator-action="toggle-common-settings"]')?.addEventListener("click", (event) => {
      commonSettingsCollapsed = !commonSettingsCollapsed;
      const group = event.currentTarget.closest(".dashboard-worksheet-common-settings");
      const icon = event.currentTarget.querySelector(".dashboard-material-icon");
      group?.classList.toggle("is-collapsed", commonSettingsCollapsed);
      event.currentTarget.setAttribute("aria-expanded", commonSettingsCollapsed ? "false" : "true");
      event.currentTarget.setAttribute("aria-label", commonSettingsCollapsed ? "Afficher les paramètres généraux" : "Masquer les paramètres généraux");
      if (icon) icon.textContent = commonSettingsCollapsed ? "expand_more" : "expand_less";
    });
    host.querySelector('[data-generator-action="regenerate"]')?.addEventListener("click", () => updateConfigFromControls({ regenerateContent:true }));
    host.querySelector('[data-generator-action="toggle-solution"]')?.addEventListener("click", () => {
      showSolutions = !showSolutions;
      render();
    });
    host.querySelector('[data-generator-action="pdf"]')?.addEventListener("click", () => { void downloadPdfCurrent(); });
    host.querySelector('[data-pentomino-action="material"]')?.addEventListener("click", openPentominoMaterialOverlay);

    host.querySelectorAll("[data-generator-per-page-direction]").forEach((button) => {
      button.addEventListener("click", () => {
        const direction = Number(button.dataset.generatorPerPageDirection) || 0;
        const options = generatorId === WORD_SEARCH_GENERATOR_ID ? WORD_SEARCH_PER_PAGE_OPTIONS : WORKSHEET_PER_PAGE_OPTIONS;
        const perPageInput = host.querySelector("#worksheet-per-page");
        const currentValue = normalizePerPage(perPageInput?.value ?? config.perPage, generatorId);
        const currentIndex = Math.max(0, options.indexOf(currentValue));
        const nextIndex = Math.min(options.length - 1, Math.max(0, currentIndex + direction));
        if (nextIndex === currentIndex) return;
        const nextValue = options[nextIndex];
        if (perPageInput) perPageInput.value = String(nextValue);
        config.perPage = nextValue;
        if (generatorId === WORD_SEARCH_GENERATOR_ID) config.landscape = getWordSearchLandscape(nextValue);
        host.querySelector('[data-generator-per-page-direction="-1"]')?.toggleAttribute("disabled", nextIndex <= 0);
        host.querySelector('[data-generator-per-page-direction="1"]')?.toggleAttribute("disabled", nextIndex >= options.length - 1);
        updateConfigFromControls({ regenerateContent:true });
      });
    });

    bindStepperField(host, "worksheet-page-count", {
      inputMin:1,
      inputMax:20,
      onChange:() => updateConfigFromControls({ regenerateContent:true })
    });

    host.querySelector('[data-generator-field="different-exercises"]')?.addEventListener("change", () => updateConfigFromControls({ regenerateContent:true }));
    ["cut-lines", "landscape"].forEach((field) => {
      host.querySelector(`[data-generator-field="${field}"]`)?.addEventListener("change", () => updateConfigFromControls({ regenerateContent:false }));
    });

    if (generatorId === WORD_SEARCH_GENERATOR_ID) {
      bindStepperField(host, "worksheet-word-search-grid-size", {
        inputMin:6, inputMax:18, onChange:() => updateConfigFromControls({ regenerateContent:true })
      });
      host.querySelector('[data-generator-field="show-word-list"]')?.addEventListener("change", () => updateConfigFromControls({ regenerateContent:false }));
      host.querySelector('[data-word-search-action="source"]')?.addEventListener("click", openWordSourceChooser);
      host.querySelectorAll('[data-word-search-direction]').forEach((input) => {
        input.addEventListener("change", () => {
          const selected = [...host.querySelectorAll('[data-word-search-direction]:checked')].map((item) => item.dataset.wordSearchDirection);
          if (!selected.length) {
            input.checked = true;
            input.closest(".dashboard-word-search-direction-option")?.classList.add("is-selected");
            showToast?.("Garde au moins une orientation pour les mots.", { isError:true });
            return;
          }
          host.querySelectorAll('[data-word-search-direction]').forEach((item) => {
            item.closest(".dashboard-word-search-direction-option")?.classList.toggle("is-selected", item.checked === true);
          });
          config.directions = normalizeWordSearchDirections(selected);
          configEditRevision += 1;
          scheduleSettingsSave();
          regenerate();
        });
      });
      return;
    }

    if (generatorId === NUMBER_MYSTERY_GENERATOR_ID) {
      [
        "worksheet-number-mystery-target",
        "worksheet-number-mystery-operand"
      ].forEach((idPrefix) => {
        bindBasicMinMax(host, idPrefix, {
          inputMin:0,
          inputMax:999
        });
      });
      [
        "worksheet-number-mystery-target_min",
        "worksheet-number-mystery-target_max",
        "worksheet-number-mystery-operand_min",
        "worksheet-number-mystery-operand_max"
      ].forEach((id) => {
        host.querySelector(`#${id}`)?.addEventListener("change", () => updateConfigFromControls({ regenerateContent:true }));
      });
      host.querySelectorAll("[data-number-mystery-operation]").forEach((input) => {
        input.addEventListener("change", () => {
          input.closest(".tv-radio-row")?.classList.toggle("is-selected", input.checked === true);
          updateConfigFromControls({ regenerateContent:true });
        });
      });
      host.querySelectorAll("[data-number-mystery-form]").forEach((input) => {
        input.addEventListener("change", () => {
          const selectedForms = Array.from(host.querySelectorAll("[data-number-mystery-form]:checked"));
          if (!selectedForms.length) input.checked = true;
          host.querySelectorAll("[data-number-mystery-form]").forEach((formInput) => {
            formInput.closest(".tv-radio-row")?.classList.toggle("is-selected", formInput.checked === true);
          });
          updateConfigFromControls({ regenerateContent:true });
        });
      });
      return;
    }

    bindStepperField(host, "worksheet-magic-sum", {
      inputMin:15,
      inputMax:999,
      onChange:() => updateConfigFromControls({ regenerateContent:true })
    });

    bindStepperField(host, "worksheet-magic-given-count", {
      inputMin:3,
      inputMax:6,
      onChange:() => updateConfigFromControls({ regenerateContent:true })
    });

    host.querySelector('[data-generator-field="show-sums"]')?.addEventListener("change", () => updateConfigFromControls({ regenerateContent:false }));
  }

  function close(){
    void flushPendingSettingsSave();
    cleanupPreviewObserver();
    openRevision += 1;
    setOpenState(false);
    generatorId = "";
    onBack?.();
  }

  return {
    open(id){
      const requested = String(id || "");
      if (![MAGIC_SQUARE_GENERATOR_ID, NUMBER_MYSTERY_GENERATOR_ID, WORD_SEARCH_GENERATOR_ID, PENTOMINO_GENERATOR_ID].includes(requested)) {
        showToast?.("Ce générateur n’est pas encore disponible.", { isError:true });
        return;
      }
      void flushPendingSettingsSave();
      generatorId = requested;
      config = getDefaultConfig(generatorId);
      showSolutions = false;
      commonSettingsCollapsed = true;
      previewZoom = null;
      configEditRevision = 0;
      const requestedOpenRevision = ++openRevision;
      const requestedEditRevision = configEditRevision;
      lastPersistedSettingsByGenerator.set(
        generatorId,
        serializePersistableConfig(generatorId, config)
      );
      try {
        worksheet = buildWorksheet(generatorId, config);
      } catch (error) {
        console.error("Génération initiale impossible.", error);
        showToast?.(error?.message || "Génération impossible.", { isError:true });
        return;
      }
      setOpenState(true);
      render();
      void hydrateSavedSettings(requested, requestedOpenRevision, requestedEditRevision);
    },
    close,
    render,
    isOpen:() => isOpen
  };
}
