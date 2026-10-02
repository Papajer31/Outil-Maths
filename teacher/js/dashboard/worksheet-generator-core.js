export const WORKSHEET_LAYOUTS = Object.freeze({
  1:{ columns:1, rows:1 },
  2:{ columns:1, rows:2 },
  4:{ columns:2, rows:2 },
  6:{ columns:2, rows:3 },
  8:{ columns:2, rows:4 }
});

export const WORKSHEET_LANDSCAPE_LAYOUTS = Object.freeze({
  1:{ columns:1, rows:1 },
  2:{ columns:2, rows:1 },
  4:{ columns:2, rows:2 },
  6:{ columns:3, rows:2 },
  8:{ columns:4, rows:2 }
});

export function getWorksheetLayout(perPage, landscape = false){
  const layouts = landscape ? WORKSHEET_LANDSCAPE_LAYOUTS : WORKSHEET_LAYOUTS;
  return layouts[perPage] || layouts[6];
}

export function clampInteger(value, min, max, fallback = min){
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function normalizeMagicSum(value){
  const clamped = clampInteger(value, 15, 999, 33);
  return Math.min(999, Math.max(15, Math.round(clamped / 3) * 3));
}

export function resolveWorksheetPerPage(requested, exerciseCount){
  const numeric = Number(requested);
  if (WORKSHEET_LAYOUTS[numeric]) return numeric;
  const count = clampInteger(exerciseCount, 1, 40, 6);
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 4;
  if (count <= 6) return 6;
  if (count <= 8) return 8;
  return 6;
}

export function paginateWorksheetItems(items, perPage){
  const pageSize = WORKSHEET_LAYOUTS[perPage] ? perPage : 6;
  const source = Array.isArray(items) ? items : [];
  const pages = [];
  for (let index = 0; index < source.length; index += pageSize) {
    pages.push(source.slice(index, index + pageSize));
  }
  return pages.length ? pages : [[]];
}

function randomIndex(length){
  if (length <= 1) return 0;
  if (globalThis.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function shuffle(values){
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function buildMagicSquareCandidate(center, x, y){
  const deviations = [
    x,
    -x - y,
    y,
    y - x,
    0,
    x - y,
    -y,
    x + y,
    -x
  ];
  const values = deviations.map((offset) => center + offset);
  if (values.some((value) => value <= 0)) return null;
  if (new Set(values).size !== 9) return null;
  return { x, y, values };
}

function getRandomMagicSquareCandidate(sum){
  const center = normalizeMagicSum(sum) / 3;
  const radius = center - 1;

  // Tirage direct : évite de construire en mémoire toutes les combinaisons
  // possibles, ce qui devient inutilement lourd pour les grandes sommes.
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const x = randomIndex((radius * 2) + 1) - radius;
    const y = randomIndex((radius * 2) + 1) - radius;
    const candidate = buildMagicSquareCandidate(center, x, y);
    if (candidate) return candidate;
  }

  // Repli déterministe (atteint seulement si le hasard a été très défavorable).
  for (let x = -radius; x <= radius; x += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      const candidate = buildMagicSquareCandidate(center, x, y);
      if (candidate) return candidate;
    }
  }

  return null;
}

const MAGIC_SQUARE_LINES = Object.freeze([
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
]);

function canResolveMagicSquareByPropagation(givenIndexes){
  const known = new Set(givenIndexes);
  let progressed = true;

  while (progressed && known.size < 9) {
    progressed = false;
    for (const line of MAGIC_SQUARE_LINES) {
      const unknown = line.filter((index) => !known.has(index));
      if (unknown.length !== 1) continue;
      known.add(unknown[0]);
      progressed = true;
    }
  }

  return known.size === 9;
}

function collectGivenIndexSets(targetCount, startIndex = 0, selected = [], output = []){
  if (selected.length === targetCount) {
    if (canResolveMagicSquareByPropagation(selected)) output.push([...selected]);
    return output;
  }

  const remainingNeeded = targetCount - selected.length;
  for (let index = startIndex; index <= 9 - remainingNeeded; index += 1) {
    selected.push(index);
    collectGivenIndexSets(targetCount, index + 1, selected, output);
    selected.pop();
  }
  return output;
}

const PEDAGOGICAL_GIVEN_INDEX_SETS = Object.freeze(
  Object.fromEntries(
    [3, 4, 5, 6].map((count) => [
      count,
      Object.freeze(collectGivenIndexSets(count).map((indexes) => Object.freeze(indexes)))
    ])
  )
);

function buildGivenIndexes(count){
  const safeCount = clampInteger(count, 3, 6, 3);
  const candidates = PEDAGOGICAL_GIVEN_INDEX_SETS[safeCount] || [];
  if (!candidates.length) throw new Error("Aucune disposition résoluble n’est disponible avec ce nombre de cases données.");
  return [...candidates[randomIndex(candidates.length)]];
}

export function generateMagicSquareWorksheet({ exerciseCount = 6, sum = 33, givenCount = 3 } = {}){
  const safeCount = clampInteger(exerciseCount, 1, 160, 6);
  const safeSum = normalizeMagicSum(sum);
  const safeGivenCount = clampInteger(givenCount, 3, 6, 3);
  const exercises = [];
  const usedKeys = new Set();

  for (let index = 0; index < safeCount; index += 1) {
    let candidate = getRandomMagicSquareCandidate(safeSum);
    if (!candidate) throw new Error("Aucun carré magique n’a pu être généré avec cette somme.");

    let givenIndexes = buildGivenIndexes(safeGivenCount);
    let uniquenessKey = `${candidate.x}:${candidate.y}|${givenIndexes.join(",")}`;
    let attempt = 0;

    while (usedKeys.has(uniquenessKey) && attempt < 200) {
      candidate = getRandomMagicSquareCandidate(safeSum);
      if (!candidate) break;
      givenIndexes = buildGivenIndexes(safeGivenCount);
      uniquenessKey = `${candidate.x}:${candidate.y}|${givenIndexes.join(",")}`;
      attempt += 1;
    }
    usedKeys.add(uniquenessKey);

    exercises.push({
      id:`magic-${index + 1}-${candidate.x}-${candidate.y}`,
      number:index + 1,
      sum:safeSum,
      center:safeSum / 3,
      values:[...candidate.values],
      givenIndexes,
      parameters:{ x:candidate.x, y:candidate.y }
    });
  }

  return {
    kind:"magic-square",
    sum:safeSum,
    givenCount:safeGivenCount,
    exerciseCount:safeCount,
    exercises
  };
}

const NUMBER_MYSTERY_OPERATION_LABELS = Object.freeze({
  add:"addition",
  sub:"soustraction",
  mul:"multiplication",
  div:"division"
});

function normalizeNumberMysteryRange(minValue, maxValue){
  const min = clampInteger(minValue, 0, 999, 0);
  const max = clampInteger(maxValue, 0, 999, 99);
  return { min, max };
}

function getNumberMysteryKinds({ useAdd, useSub, useMul, useDiv } = {}){
  const kinds = [];
  if (useAdd !== false) kinds.push("add");
  if (useSub === true) kinds.push("sub");
  if (useMul === true) kinds.push("mul");
  if (useDiv === true) kinds.push("div");
  return kinds;
}

function getNumberMysteryForms(calculationForm){
  if (calculationForm === "missing") return ["missing"];
  if (calculationForm === "mixed") return ["result", "missing"];
  return ["result"];
}

function buildNumberMysteryCandidatesForResult(result, config, onlyKind = ""){
  const { min:operandMin, max:operandMax } = normalizeNumberMysteryRange(config.operandMin, config.operandMax);
  const enabledKinds = onlyKind ? [onlyKind] : getNumberMysteryKinds(config);
  const enabled = new Set(enabledKinds);
  const candidates = [];
  const keys = new Set();

  function push(kind, a, b){
    const key = `${kind}:${a}:${b}:${result}:result`;
    if (keys.has(key)) return;
    keys.add(key);
    candidates.push({ kind, a, b, result, blank:"result", answer:result });
  }

  if (enabled.has("add")) {
    for (let a = operandMin; a <= operandMax; a += 1) {
      const b = result - a;
      if (b < operandMin || b > operandMax) continue;
      push("add", a, b);
    }
  }

  if (enabled.has("sub") && result >= 0) {
    for (let a = operandMin; a <= operandMax; a += 1) {
      const b = a - result;
      if (b < operandMin || b > operandMax) continue;
      push("sub", a, b);
    }
  }

  if (enabled.has("mul")) {
    if (result === 0) {
      if (operandMin <= 0 && operandMax >= 0) {
        for (let other = operandMin; other <= operandMax; other += 1) {
          push("mul", 0, other);
          if (other !== 0) push("mul", other, 0);
        }
      }
    } else {
      for (let a = Math.max(1, operandMin); a <= operandMax; a += 1) {
        if (result % a !== 0) continue;
        const b = result / a;
        if (b < operandMin || b > operandMax) continue;
        push("mul", a, b);
      }
    }
  }

  if (enabled.has("div")) {
    for (let b = Math.max(1, operandMin); b <= operandMax; b += 1) {
      const a = result * b;
      if (a < operandMin || a > operandMax) continue;
      push("div", a, b);
    }
  }

  return candidates;
}

function getNumberMysteryAnswer(operation){
  if (operation?.blank === "a") return Number(operation.a);
  if (operation?.blank === "b") return Number(operation.b);
  return Number(operation?.result);
}

function withNumberMysteryAnswer(operation){
  return { ...operation, answer:getNumberMysteryAnswer(operation) };
}

function buildNumberMysteryCandidatesForAnswer(answer, config, onlyKind = ""){
  const { min:operandMin, max:operandMax } = normalizeNumberMysteryRange(config.operandMin, config.operandMax);
  const enabledKinds = onlyKind ? [onlyKind] : getNumberMysteryKinds(config);
  const forms = new Set(getNumberMysteryForms(config.calculationForm));
  const candidates = [];
  const keys = new Set();

  function push(kind, a, b, result, blank){
    if (![a, b, result].every(Number.isFinite)) return;
    if (![a, b, result].every(Number.isInteger)) return;
    if (a < 0 || b < 0 || result < 0) return;
    if (kind === "sub" && a < b) return;
    if (kind === "div" && (b === 0 || a % b !== 0 || (a / b) !== result)) return;
    if (kind === "mul" && blank === "a" && b === 0) return;
    if (kind === "mul" && blank === "b" && a === 0) return;
    if (kind === "div" && blank === "b" && a === 0 && result === 0) return;

    // La plage « Nombres dans les calculs » concerne ce que l’élève voit.
    // La valeur masquée, elle, appartient à la plage « Nombres à trouver ».
    const visibleValues = blank === "result" ? [a, b] : blank === "a" ? [b, result] : [a, result];
    if (visibleValues.some((value) => value < operandMin || value > operandMax)) return;

    const operation = withNumberMysteryAnswer({ kind, a, b, result, blank });
    if (operation.answer !== answer) return;
    const key = `${kind}:${a}:${b}:${result}:${blank}`;
    if (keys.has(key)) return;
    keys.add(key);
    candidates.push(operation);
  }

  for (const kind of enabledKinds) {
    if (forms.has("result")) {
      for (const candidate of buildNumberMysteryCandidatesForResult(answer, config, kind)) {
        push(candidate.kind, candidate.a, candidate.b, candidate.result, "result");
      }
    }

    if (!forms.has("missing")) continue;

    for (let b = operandMin; b <= operandMax; b += 1) {
      if (kind === "add") push(kind, answer, b, answer + b, "a");
      else if (kind === "sub") push(kind, answer, b, answer - b, "a");
      else if (kind === "mul") push(kind, answer, b, answer * b, "a");
      else if (kind === "div" && b !== 0 && answer % b === 0) push(kind, answer, b, answer / b, "a");
    }

    for (let a = operandMin; a <= operandMax; a += 1) {
      if (kind === "add") push(kind, a, answer, a + answer, "b");
      else if (kind === "sub") push(kind, a, answer, a - answer, "b");
      else if (kind === "mul") push(kind, a, answer, a * answer, "b");
      else if (kind === "div" && answer !== 0 && a % answer === 0) push(kind, a, answer, a / answer, "b");
    }
  }

  return candidates;
}

function hasFactorPairInRange(value, min, max){
  if (value === 0) return min === 0;
  if (value < 0) return false;
  const limit = Math.floor(Math.sqrt(value));
  for (let factor = 1; factor <= limit; factor += 1) {
    if (value % factor !== 0) continue;
    const other = value / factor;
    if (factor >= min && factor <= max && other >= min && other <= max) return true;
  }
  return false;
}

function canBuildNumberMysteryResult(answer, kind, operandMin, operandMax){
  if (kind === "add") return answer >= (operandMin * 2) && answer <= (operandMax * 2);
  if (kind === "sub") return answer >= 0 && answer <= (operandMax - operandMin);
  if (kind === "mul") return hasFactorPairInRange(answer, operandMin, operandMax);
  if (kind === "div") {
    const positiveMin = Math.max(1, operandMin);
    if (positiveMin > operandMax) return false;
    if (answer === 0) return operandMin === 0;
    const lowerB = Math.max(positiveMin, Math.ceil(operandMin / answer));
    const upperB = Math.min(operandMax, Math.floor(operandMax / answer));
    return lowerB <= upperB;
  }
  return false;
}

function canBuildNumberMysteryMissing(answer, kind, operandMin, operandMax){
  for (let known = operandMin; known <= operandMax; known += 1) {
    if (kind === "add") {
      const result = answer + known;
      if (result >= operandMin && result <= operandMax) return true;
      continue;
    }

    if (kind === "sub") {
      const resultWithMissingA = answer - known;
      if (answer >= known && resultWithMissingA >= operandMin && resultWithMissingA <= operandMax) return true;
      const resultWithMissingB = known - answer;
      if (known >= answer && resultWithMissingB >= operandMin && resultWithMissingB <= operandMax) return true;
      continue;
    }

    if (kind === "mul") {
      if (known === 0) continue;
      const result = answer * known;
      if (result >= operandMin && result <= operandMax) return true;
      continue;
    }

    if (kind === "div") {
      if (known > 0 && answer % known === 0) {
        const resultWithMissingA = answer / known;
        if (resultWithMissingA >= operandMin && resultWithMissingA <= operandMax) return true;
      }
      if (answer > 0 && known > 0 && known % answer === 0) {
        const resultWithMissingB = known / answer;
        if (resultWithMissingB >= operandMin && resultWithMissingB <= operandMax) return true;
      }
    }
  }
  return false;
}

function validateNumberMysteryConfig(config){
  const { min:targetMin, max:targetMax } = normalizeNumberMysteryRange(config.targetMin, config.targetMax);
  const { min:operandMin, max:operandMax } = normalizeNumberMysteryRange(config.operandMin, config.operandMax);
  if (targetMax < targetMin) throw new Error("Le maximum des nombres à trouver doit être supérieur ou égal au minimum.");
  if (operandMax < operandMin) throw new Error("Le maximum des nombres dans les calculs doit être supérieur ou égal au minimum.");
  if ((targetMax - targetMin + 1) < 9) throw new Error("La plage des nombres à trouver doit contenir au moins 9 nombres.");
  const kinds = getNumberMysteryKinds(config);
  if (!kinds.length) throw new Error("Active au moins une opération.");
  const forms = getNumberMysteryForms(config.calculationForm);
  return { targetMin, targetMax, operandMin, operandMax, kinds, forms };
}

function buildNumberMysteryCompatibility(config){
  const { targetMin, targetMax, operandMin, operandMax, kinds, forms } = validateNumberMysteryConfig(config);
  const entries = [];
  const supportedKinds = new Set();
  const supportedForms = new Set();

  for (let answer = targetMin; answer <= targetMax; answer += 1) {
    const capabilities = [];
    for (const kind of kinds) {
      for (const form of forms) {
        const possible = form === "result"
          ? canBuildNumberMysteryResult(answer, kind, operandMin, operandMax)
          : canBuildNumberMysteryMissing(answer, kind, operandMin, operandMax);
        if (!possible) continue;
        capabilities.push({ kind, form });
        supportedKinds.add(kind);
        supportedForms.add(form);
      }
    }
    if (capabilities.length) entries.push({ answer, capabilities });
  }

  if (entries.length < 8) {
    throw new Error("Pas assez de nombres différents peuvent être générés avec ces réglages. Élargis une des plages ou autorise une autre opération.");
  }

  const unavailableKinds = kinds.filter((kind) => !supportedKinds.has(kind));
  if (unavailableKinds.length) {
    const labels = unavailableKinds.map((kind) => NUMBER_MYSTERY_OPERATION_LABELS[kind] || kind).join(", ");
    throw new Error(`Ces réglages ne permettent pas d’utiliser : ${labels}.`);
  }

  if (forms.length > 1) {
    const unavailableForms = forms.filter((form) => !supportedForms.has(form));
    if (unavailableForms.length) {
      throw new Error("Ces réglages ne permettent pas de mélanger résultats à trouver et nombres manquants.");
    }
  }

  return { targetMin, targetMax, operandMin, operandMax, kinds, forms, entries };
}

function capabilityKey(capability){
  return `${capability.kind}:${capability.form}`;
}

function selectNumberMysteryAssignments(model){
  const requiredKinds = new Set(model.kinds);
  const requiredForms = new Set(model.forms);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const unused = shuffle(model.entries).map((entry) => ({ ...entry }));
    const assignments = [];
    const kindUsage = new Map(model.kinds.map((kind) => [kind, 0]));
    const formUsage = new Map(model.forms.map((form) => [form, 0]));

    while (assignments.length < 8 && unused.length) {
      const pairs = new Map();
      for (const entry of unused) {
        for (const capability of entry.capabilities) {
          const key = capabilityKey(capability);
          if (!pairs.has(key)) pairs.set(key, { capability, entries:[] });
          pairs.get(key).entries.push(entry);
        }
      }
      if (!pairs.size) break;

      const choices = shuffle([...pairs.values()]).sort((left, right) => {
        const leftKind = kindUsage.get(left.capability.kind) || 0;
        const rightKind = kindUsage.get(right.capability.kind) || 0;
        if (leftKind !== rightKind) return leftKind - rightKind;
        const leftForm = formUsage.get(left.capability.form) || 0;
        const rightForm = formUsage.get(right.capability.form) || 0;
        if (leftForm !== rightForm) return leftForm - rightForm;
        return left.entries.length - right.entries.length;
      });

      const chosenPair = choices[0];
      const chosenEntry = shuffle(chosenPair.entries).sort((left, right) => left.capabilities.length - right.capabilities.length)[0];
      assignments.push({ answer:chosenEntry.answer, ...chosenPair.capability });
      kindUsage.set(chosenPair.capability.kind, (kindUsage.get(chosenPair.capability.kind) || 0) + 1);
      formUsage.set(chosenPair.capability.form, (formUsage.get(chosenPair.capability.form) || 0) + 1);
      const usedIndex = unused.findIndex((entry) => entry.answer === chosenEntry.answer);
      if (usedIndex >= 0) unused.splice(usedIndex, 1);
    }

    if (assignments.length !== 8) continue;
    const usedKinds = new Set(assignments.map((assignment) => assignment.kind));
    const usedForms = new Set(assignments.map((assignment) => assignment.form));
    if ([...requiredKinds].some((kind) => !usedKinds.has(kind))) continue;
    if ([...requiredForms].some((form) => !usedForms.has(form))) continue;
    return assignments;
  }

  throw new Error("Ces réglages sont compatibles, mais pas assez variés pour construire 8 calculs différents. Élargis légèrement une des plages.");
}

function pickNumberMysteryOperation(assignment, config){
  const candidates = buildNumberMysteryCandidatesForAnswer(
    assignment.answer,
    { ...config, calculationForm:assignment.form },
    assignment.kind
  );
  if (!candidates.length) {
    throw new Error(`Aucun calcul compatible n’a pu être construit pour ${assignment.answer}.`);
  }
  return candidates[randomIndex(candidates.length)];
}

function generateNumberMysteryExercise(config, model){
  const assignments = selectNumberMysteryAssignments(model);
  const answers = assignments.map((assignment) => assignment.answer);
  const answerSet = new Set(answers);
  const mysteryCandidates = [];
  for (let value = model.targetMin; value <= model.targetMax; value += 1) {
    if (!answerSet.has(value)) mysteryCandidates.push(value);
  }
  if (!mysteryCandidates.length) throw new Error("Impossible de choisir un nombre mystérieux distinct.");

  const operations = shuffle(assignments.map((assignment) => pickNumberMysteryOperation(assignment, config)));
  const mystery = mysteryCandidates[randomIndex(mysteryCandidates.length)];
  const gridNumbers = shuffle([...answers, mystery]);
  return { gridNumbers, mystery, operations };
}

function numberMysterySignature(exercise){
  const grid = [...(exercise.gridNumbers || [])].sort((a, b) => a - b).join(",");
  const ops = (exercise.operations || []).map((op) => `${op.kind}:${op.a}:${op.b}:${op.result}:${op.blank}`).sort().join("|");
  return `${grid}#${exercise.mystery}#${ops}`;
}

export function generateNumberMysteryWorksheet({
  exerciseCount = 4,
  targetMin = 80,
  targetMax = 89,
  operandMin = 20,
  operandMax = 70,
  useAdd = true,
  useSub = false,
  useMul = false,
  useDiv = false,
  calculationForm = "result"
} = {}){
  const safeCount = clampInteger(exerciseCount, 1, 160, 4);
  const config = {
    targetMin,
    targetMax,
    operandMin,
    operandMax,
    useAdd,
    useSub,
    useMul,
    useDiv,
    calculationForm:["result", "missing", "mixed"].includes(calculationForm) ? calculationForm : "result"
  };
  const model = buildNumberMysteryCompatibility(config);

  const exercises = [];
  const usedSignatures = new Set();
  for (let index = 0; index < safeCount; index += 1) {
    let exercise = null;
    let signature = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const generated = generateNumberMysteryExercise(config, model);
      exercise = {
        id:`number-mystery-${index + 1}-${attempt + 1}`,
        number:index + 1,
        ...generated
      };
      signature = numberMysterySignature(exercise);
      if (!usedSignatures.has(signature)) break;
    }
    if (!exercise) throw new Error("Impossible de générer l’exercice.");
    usedSignatures.add(signature);
    exercises.push(exercise);
  }

  return {
    kind:"number-mystery",
    exerciseCount:safeCount,
    config:{ ...config },
    exercises
  };
}

const WORD_SEARCH_DIRECTION_VECTORS = Object.freeze({
  up:Object.freeze([-1,0]),
  upRight:Object.freeze([-1,1]),
  right:Object.freeze([0,1]),
  downRight:Object.freeze([1,1]),
  down:Object.freeze([1,0]),
  downLeft:Object.freeze([1,-1]),
  left:Object.freeze([0,-1]),
  upLeft:Object.freeze([-1,-1])
});

const DEFAULT_WORD_SEARCH_DIRECTIONS = Object.freeze(["right","down"]);

function normalizeWordSearchDirections(values){
  const source = Array.isArray(values) ? values : [];
  const names = [...new Set(source.filter((name) => WORD_SEARCH_DIRECTION_VECTORS[name]))];
  return names.length ? names : [...DEFAULT_WORD_SEARCH_DIRECTIONS];
}

function normalizeWordSearchWord(value){
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]/g, "")
    .toLocaleUpperCase("fr-FR")
    .normalize("NFC");
}

const WORD_SEARCH_FRENCH_COLLATOR = new Intl.Collator("fr-FR", {
  usage:"sort",
  sensitivity:"variant",
  ignorePunctuation:false,
  numeric:false
});

function sortWordSearchWordsFrench(words){
  return [...words].sort((a, b) => WORD_SEARCH_FRENCH_COLLATOR.compare(a.display, b.display));
}

export function parseWordSearchWords(values){
  const source = Array.isArray(values) ? values : String(values ?? "").split(/[\n,;]+/g);
  const seen = new Set();
  const words = [];
  for (const raw of source) {
    const display = String(raw ?? "").trim();
    const normalized = normalizeWordSearchWord(display);
    if (normalized.length < 2 || seen.has(normalized)) continue;
    seen.add(normalized);
    words.push({ display:display.toLocaleUpperCase("fr-FR"), normalized });
  }
  return words;
}

function wordSearchPlacementOptions(grid, word, directions){
  const size = grid.length;
  const options = [];
  for (const [dr, dc] of directions) {
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const endRow = row + (dr * (word.length - 1));
        const endCol = col + (dc * (word.length - 1));
        if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
        let crossings = 0;
        let valid = true;
        for (let index = 0; index < word.length; index += 1) {
          const r = row + (dr * index);
          const c = col + (dc * index);
          const existing = grid[r][c];
          if (existing && existing !== word[index]) { valid = false; break; }
          if (existing === word[index]) crossings += 1;
        }
        if (!valid) continue;
        const center = (size - 1) / 2;
        const middleRow = (row + endRow) / 2;
        const middleCol = (col + endCol) / 2;
        const centerPenalty = Math.abs(middleRow - center) + Math.abs(middleCol - center);
        options.push({ row, col, dr, dc, crossings, score:(crossings * 100) - centerPenalty + Math.random() });
      }
    }
  }
  options.sort((a,b) => b.score - a.score);
  return options;
}

const WORD_SEARCH_ALL_DIRECTIONS = Object.freeze([[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]);

function wordSearchPathKey(cells){
  const forward = cells.map(([row,col]) => `${row}:${col}`).join("|");
  const backward = [...cells].reverse().map(([row,col]) => `${row}:${col}`).join("|");
  return forward < backward ? forward : backward;
}

function findWordSearchOccurrences(grid, word){
  const size = grid.length;
  const found = new Map();
  for (const [dr,dc] of WORD_SEARCH_ALL_DIRECTIONS) {
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const endRow = row + (dr * (word.length - 1));
        const endCol = col + (dc * (word.length - 1));
        if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
        const cells = [];
        let matches = true;
        for (let index = 0; index < word.length; index += 1) {
          const r = row + (dr * index);
          const c = col + (dc * index);
          if (grid[r][c] !== word[index]) { matches = false; break; }
          cells.push([r,c]);
        }
        if (matches) found.set(wordSearchPathKey(cells), cells);
      }
    }
  }
  return [...found.values()];
}

function fillWordSearchGridWithoutAccidentalWords(grid, placements){
  const alphabet = "EEEEEEEEAAAAAAIIIIIIISSSSSSNNNNNRRRRRTTTTTOOOOOLLLLUUUUDDDDCCCCMPGBVFQHJXYZKWÉÉÈÀÇ";
  const emptyCells = [];
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid.length; col += 1) {
      if (!grid[row][col]) emptyCells.push([row,col]);
    }
  }
  for (let attempt = 0; attempt < 300; attempt += 1) {
    for (const [row,col] of emptyCells) grid[row][col] = alphabet[randomIndex(alphabet.length)];
    const valid = placements.every((placement) => {
      const occurrences = findWordSearchOccurrences(grid, placement.normalized);
      return occurrences.length === 1 && wordSearchPathKey(occurrences[0]) === wordSearchPathKey(placement.cells);
    });
    if (valid) return true;
  }
  for (const [row,col] of emptyCells) grid[row][col] = "";
  return false;
}

function buildWordSearchCandidate(words, size, directionNames){
  const grid = Array.from({ length:size }, () => Array(size).fill(""));
  const placements = [];
  const directions = normalizeWordSearchDirections(directionNames).map((name) => WORD_SEARCH_DIRECTION_VECTORS[name]);
  const ordered = [...words].sort((a,b) => b.normalized.length - a.normalized.length || Math.random() - .5);
  for (const item of ordered) {
    const options = wordSearchPlacementOptions(grid, item.normalized, directions);
    if (!options.length) return null;
    const bestScore = options[0].score;
    const nearBest = options.filter((option) => option.score >= bestScore - 8);
    const chosen = nearBest[randomIndex(nearBest.length)];
    const cells = [];
    for (let index = 0; index < item.normalized.length; index += 1) {
      const row = chosen.row + (chosen.dr * index);
      const col = chosen.col + (chosen.dc * index);
      grid[row][col] = item.normalized[index];
      cells.push([row, col]);
    }
    placements.push({ word:item.display, normalized:item.normalized, cells });
  }
  if (!fillWordSearchGridWithoutAccidentalWords(grid, placements)) return null;
  const crossings = placements.reduce((sum, placement) => sum + placement.cells.filter(([r,c]) => {
    return placements.some((other) => other !== placement && other.cells.some(([or,oc]) => or === r && oc === c));
  }).length, 0);
  return { grid, placements, score:crossings };
}

export function generateWordSearchWorksheet({ exerciseCount = 4, words = [], gridSize = 10, directions = DEFAULT_WORD_SEARCH_DIRECTIONS } = {}){
  const safeCount = clampInteger(exerciseCount, 1, 80, 4);
  const parsed = parseWordSearchWords(words);
  if (parsed.length < 2) throw new Error("Ajoute au moins deux mots pour générer une grille.");
  const longest = Math.max(...parsed.map((word) => word.normalized.length));
  const safeSize = clampInteger(Math.max(Number(gridSize) || 10, longest), 6, 18, 10);
  const safeDirections = normalizeWordSearchDirections(directions);
  const usable = sortWordSearchWordsFrench(parsed.filter((word) => word.normalized.length <= safeSize));
  if (usable.length < 2) throw new Error("La grille est trop petite pour les mots choisis.");
  const exercises = [];
  for (let index = 0; index < safeCount; index += 1) {
    let best = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = buildWordSearchCandidate(shuffle(usable), safeSize, safeDirections);
      if (!candidate) continue;
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (!best) throw new Error("Impossible de placer tous les mots dans cette grille avec les orientations choisies. Augmente sa taille, active d’autres orientations ou réduis la liste.");
    exercises.push({
      id:`word-search-${index + 1}`,
      number:index + 1,
      gridSize:safeSize,
      grid:best.grid,
      words:usable.map((word) => word.display),
      placements:best.placements,
      directions:[...safeDirections]
    });
  }
  return { kind:"word-search", exerciseCount:safeCount, gridSize:safeSize, directions:[...safeDirections], exercises };
}

// --- Pentaminos -----------------------------------------------------------
// Coordonnées canoniques des 12 pentaminos libres. Le générateur de défis
// utilise tous les pentaminos sauf I ; la planche de matériel conserve les 12.
export const PENTOMINO_SHAPES = Object.freeze({
  F:Object.freeze([[1,0],[0,1],[1,1],[1,2],[2,2]]),
  I:Object.freeze([[0,0],[1,0],[2,0],[3,0],[4,0]]),
  L:Object.freeze([[0,0],[0,1],[0,2],[0,3],[1,3]]),
  N:Object.freeze([[0,0],[0,1],[1,1],[1,2],[1,3]]),
  P:Object.freeze([[0,0],[1,0],[0,1],[1,1],[0,2]]),
  T:Object.freeze([[0,0],[1,0],[2,0],[1,1],[1,2]]),
  U:Object.freeze([[0,0],[2,0],[0,1],[1,1],[2,1]]),
  V:Object.freeze([[0,0],[0,1],[0,2],[1,2],[2,2]]),
  W:Object.freeze([[0,0],[0,1],[1,1],[1,2],[2,2]]),
  X:Object.freeze([[1,0],[0,1],[1,1],[2,1],[1,2]]),
  Y:Object.freeze([[0,0],[0,1],[0,2],[0,3],[1,2]]),
  Z:Object.freeze([[0,0],[1,0],[1,1],[1,2],[2,2]])
});

export const PENTOMINO_NAMES = Object.freeze(Object.keys(PENTOMINO_SHAPES));
export const PENTOMINO_CHALLENGE_NAMES = Object.freeze(PENTOMINO_NAMES.filter((name) => name !== "I"));

function normalizePentominoCells(cells){
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([,y]) => y));
  return cells
    .map(([x,y]) => [x - minX, y - minY])
    .sort((a,b) => a[1] - b[1] || a[0] - b[0]);
}

function pentominoCellsKey(cells){
  return cells.map(([x,y]) => `${x},${y}`).join(";");
}

const PENTOMINO_ORIENTATIONS = new Map();
function getPentominoOrientations(name){
  if (PENTOMINO_ORIENTATIONS.has(name)) return PENTOMINO_ORIENTATIONS.get(name);
  const source = PENTOMINO_SHAPES[name] || [];
  const unique = new Map();
  for (const reflected of [false, true]) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const transformed = source.map(([sourceX, sourceY]) => {
        let x = reflected ? -sourceX : sourceX;
        let y = sourceY;
        for (let turn = 0; turn < rotation; turn += 1) [x,y] = [-y,x];
        return [x,y];
      });
      const normalized = normalizePentominoCells(transformed);
      unique.set(pentominoCellsKey(normalized), normalized);
    }
  }
  const orientations = [...unique.values()];
  PENTOMINO_ORIENTATIONS.set(name, orientations);
  return orientations;
}

const PENTOMINO_PLACEMENTS_CACHE = new Map();
function getPentominoPlacements(name, width, height){
  const key = `${name}:${width}x${height}`;
  if (PENTOMINO_PLACEMENTS_CACHE.has(key)) return PENTOMINO_PLACEMENTS_CACHE.get(key);
  const placements = [];
  for (const cells of getPentominoOrientations(name)) {
    const shapeWidth = Math.max(...cells.map(([x]) => x)) + 1;
    const shapeHeight = Math.max(...cells.map(([,y]) => y)) + 1;
    if (shapeWidth > width || shapeHeight > height) continue;
    for (let y = 0; y <= height - shapeHeight; y += 1) {
      for (let x = 0; x <= width - shapeWidth; x += 1) {
        const boardCells = cells.map(([cellX, cellY]) => [cellX + x, cellY + y]);
        let mask = 0n;
        for (const [cellX, cellY] of boardCells) mask |= 1n << BigInt((cellY * width) + cellX);
        placements.push({ name, cells:boardCells, mask });
      }
    }
  }
  PENTOMINO_PLACEMENTS_CACHE.set(key, placements);
  return placements;
}

const PENTOMINO_SOLVE_CACHE = new Map();
function solvePentominoSet(pieceNames, width, height){
  const names = [...pieceNames].sort();
  const cacheKey = `${width}x${height}:${names.join("")}`;
  if (PENTOMINO_SOLVE_CACHE.has(cacheKey)) return PENTOMINO_SOLVE_CACHE.get(cacheKey);
  if (names.length * 5 !== width * height) {
    PENTOMINO_SOLVE_CACHE.set(cacheKey, null);
    return null;
  }

  const allPlacements = names.flatMap((name) => getPentominoPlacements(name, width, height));
  const placementsByCell = Array.from({ length:width * height }, () => []);
  for (const placement of allPlacements) {
    for (const [x,y] of placement.cells) placementsByCell[(y * width) + x].push(placement);
  }
  const fullMask = (1n << BigInt(width * height)) - 1n;

  function search(occupied, used, solution){
    if (occupied === fullMask) return solution.map((placement) => ({
      name:placement.name,
      cells:placement.cells.map(([x,y]) => [x,y])
    }));

    let bestOptions = null;
    for (let cellIndex = 0; cellIndex < width * height; cellIndex += 1) {
      const cellBit = 1n << BigInt(cellIndex);
      if ((occupied & cellBit) !== 0n) continue;
      const options = placementsByCell[cellIndex].filter((placement) => (
        !used.has(placement.name) && (placement.mask & occupied) === 0n
      ));
      if (!options.length) return null;
      if (!bestOptions || options.length < bestOptions.length) {
        bestOptions = options;
        if (options.length === 1) break;
      }
    }

    for (const placement of shuffle(bestOptions || [])) {
      used.add(placement.name);
      solution.push(placement);
      const found = search(occupied | placement.mask, used, solution);
      if (found) return found;
      solution.pop();
      used.delete(placement.name);
    }
    return null;
  }

  const solved = search(0n, new Set(), []);
  PENTOMINO_SOLVE_CACHE.set(cacheKey, solved);
  return solved;
}

let pentominoInitialSets = null;
function getPentominoInitialSets(){
  if (pentominoInitialSets) return pentominoInitialSets;
  const output = [];
  const names = PENTOMINO_CHALLENGE_NAMES;
  for (let a = 0; a < names.length - 3; a += 1) {
    for (let b = a + 1; b < names.length - 2; b += 1) {
      for (let c = b + 1; c < names.length - 1; c += 1) {
        for (let d = c + 1; d < names.length; d += 1) output.push([names[a], names[b], names[c], names[d]]);
      }
    }
  }
  pentominoInitialSets = output;
  return output;
}

function findPentominoChallenge(usedSignatures = new Set()){
  for (const initial of shuffle(getPentominoInitialSets())) {
    const firstSolution = solvePentominoSet(initial, 4, 5);
    if (!firstSolution) continue;
    const stages = [{ count:4, width:4, height:5, solution:firstSolution }];

    function extend(sequence, currentStages){
      if (sequence.length === 8) {
        const signature = `${[...sequence.slice(0,4)].sort().join("")}|${sequence.slice(4).join("")}`;
        if (usedSignatures.has(signature)) return null;
        return { sequence, stages:currentStages, signature };
      }
      const nextCount = sequence.length + 1;
      const candidates = shuffle(PENTOMINO_CHALLENGE_NAMES.filter((name) => !sequence.includes(name)));
      for (const name of candidates) {
        const nextSequence = [...sequence, name];
        const solution = solvePentominoSet(nextSequence, nextCount, 5);
        if (!solution) continue;
        const found = extend(nextSequence, [...currentStages, {
          count:nextCount,
          width:nextCount,
          height:5,
          solution
        }]);
        if (found) return found;
      }
      return null;
    }

    const found = extend(shuffle(initial), stages);
    if (found) return found;
  }
  return null;
}

export function generatePentominoWorksheet({ exerciseCount = 4 } = {}){
  const safeCount = clampInteger(exerciseCount, 1, 160, 4);
  const exercises = [];
  const usedSignatures = new Set();
  for (let index = 0; index < safeCount; index += 1) {
    const challenge = findPentominoChallenge(usedSignatures);
    if (!challenge) throw new Error("Impossible de générer davantage de défis pentaminos différents.");
    usedSignatures.add(challenge.signature);
    exercises.push({
      id:`pentomino-${index + 1}-${challenge.signature.replace(/[^A-Z]/g, "")}`,
      number:index + 1,
      pieces:[...challenge.sequence],
      stages:challenge.stages.map((stage) => ({
        ...stage,
        solution:stage.solution.map((placement) => ({
          name:placement.name,
          cells:placement.cells.map(([x,y]) => [x,y])
        }))
      }))
    });
  }
  return { kind:"pentomino", exerciseCount:safeCount, exercises };
}
