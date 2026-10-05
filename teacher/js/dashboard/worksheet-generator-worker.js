import {
  generateMagicSquareWorksheet,
  generateNumberMysteryWorksheet,
  generatePentominoWorksheet,
  generateWordSearchWorksheet
} from "./worksheet-generator-core.js";

const MAGIC_SQUARE_GENERATOR_ID = "magic-square";
const NUMBER_MYSTERY_GENERATOR_ID = "number-mystery";
const WORD_SEARCH_GENERATOR_ID = "word-search";
const PENTOMINO_GENERATOR_ID = "pentomino";

function clampInteger(value, min, max, fallback = min){
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function getTotalSlots(config = {}){
  const perPage = clampInteger(config.perPage, 1, 8, 1);
  const pageCount = clampInteger(config.pageCount, 1, 20, 1);
  return perPage * pageCount;
}

function cloneRepeatedExercise(exercise, index){
  return {
    ...exercise,
    id:`${exercise.id}-copy-${index + 1}`,
    number:index + 1,
    values:Array.isArray(exercise.values) ? [...exercise.values] : exercise.values,
    givenIndexes:Array.isArray(exercise.givenIndexes) ? [...exercise.givenIndexes] : exercise.givenIndexes,
    gridNumbers:Array.isArray(exercise.gridNumbers) ? [...exercise.gridNumbers] : exercise.gridNumbers,
    operations:Array.isArray(exercise.operations) ? exercise.operations.map((operation) => ({ ...operation })) : exercise.operations,
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
  return { ...generated, exerciseCount:totalSlots, exercises };
}

function buildMagicSquareWorksheet(config){
  const totalSlots = getTotalSlots(config);
  const requestedCount = config.differentExercises ? totalSlots : 1;
  const generated = generateMagicSquareWorksheet({
    exerciseCount:requestedCount,
    sum:config.sum,
    givenCount:config.givenCount
  });
  if (!config.differentExercises) return repeatWorksheetExercise(generated, totalSlots);
  return { ...generated, exerciseCount:totalSlots, exercises:generated.exercises.slice(0, totalSlots) };
}

function buildNumberMysteryWorksheet(config){
  const totalSlots = getTotalSlots(config);
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
  return { ...generated, exerciseCount:totalSlots, exercises:generated.exercises.slice(0, totalSlots) };
}

function buildWordSearchWorksheet(config){
  const totalSlots = getTotalSlots(config);
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
  const totalSlots = getTotalSlots(config);
  const requestedCount = config.differentExercises ? totalSlots : 1;
  const generated = generatePentominoWorksheet({ exerciseCount:requestedCount });
  if (!config.differentExercises) return repeatWorksheetExercise(generated, totalSlots);
  return { ...generated, exerciseCount:totalSlots, exercises:generated.exercises.slice(0, totalSlots) };
}

function buildWorksheet(generatorId, config){
  if (generatorId === PENTOMINO_GENERATOR_ID) return buildPentominoWorksheet(config);
  if (generatorId === WORD_SEARCH_GENERATOR_ID) return buildWordSearchWorksheet(config);
  if (generatorId === NUMBER_MYSTERY_GENERATOR_ID) return buildNumberMysteryWorksheet(config);
  return buildMagicSquareWorksheet(config);
}

self.addEventListener("message", (event) => {
  const requestId = Number(event.data?.requestId) || 0;
  try {
    const generatorId = String(event.data?.generatorId || "");
    const config = event.data?.config && typeof event.data.config === "object" ? event.data.config : {};
    const worksheet = buildWorksheet(generatorId, config);
    self.postMessage({ requestId, worksheet });
  } catch (error) {
    self.postMessage({
      requestId,
      error: String(error?.message || "Génération impossible.")
    });
  }
});
