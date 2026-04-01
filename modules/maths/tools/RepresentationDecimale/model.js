import { normalizeNumericConstraint } from "../../../../shared/value-constraints.js";

export function getDefaultSettings() {
  return {
    min: 10,
    max: 69,
    valueMode: "simple",
    valueStart: 10,
    valueStep: 1,
    valueList: [],
    usePicbille: true,
    useDede: true,
    allowNumberToRepresentation: true,
    allowRepresentationToNumber: false
  };
}

export function normalizeSettings(settings) {
  const s = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  const constraint = normalizeNumericConstraint({
    min: s.min,
    max: s.max,
    mode: s.valueMode,
    start: s.valueStart,
    step: s.valueStep,
    values: s.valueList
  }, {
    inputMin: 1,
    inputMax: 69,
    defaultMin: 10,
    defaultMax: 69,
    defaultStart: 10,
    defaultStep: 1,
    defaultValues: []
  });

  return {
    min: constraint.min,
    max: constraint.max,
    valueMode: constraint.mode,
    valueStart: constraint.start,
    valueStep: constraint.step,
    valueList: constraint.values,
    allowedValues: constraint.allowedValues,
    usePicbille: !!s.usePicbille,
    useDede: !!s.useDede,
    allowNumberToRepresentation: !!s.allowNumberToRepresentation,
    allowRepresentationToNumber: !!s.allowRepresentationToNumber
  };
}

export function getAvailableCharacters(settings) {
  const cfg = normalizeSettings(settings);
  const available = [];
  if (cfg.usePicbille) available.push("picbille");
  if (cfg.useDede) available.push("dede");
  return available;
}

export function getAvailableDirections(settings) {
  const cfg = normalizeSettings(settings);
  const available = [];
  if (cfg.allowNumberToRepresentation) available.push("number_to_representation");
  if (cfg.allowRepresentationToNumber) available.push("representation_to_number");
  return available;
}

export function pickQuestion(settings) {
  const cfg = normalizeSettings(settings);
  const availableCharacters = getAvailableCharacters(cfg);
  const availableDirections = getAvailableDirections(cfg);

  if (!availableCharacters.length) {
    throw new Error("Aucune représentation active pour ReprésentationDécimale.");
  }

  if (!availableDirections.length) {
    throw new Error("Aucun mode d'affichage actif pour ReprésentationDécimale.");
  }

  if (!cfg.allowedValues.length) {
    throw new Error("Aucun nombre disponible pour ReprésentationDécimale.");
  }

  return {
    n: pickRandom(cfg.allowedValues),
    character: pickRandom(availableCharacters),
    direction: pickRandom(availableDirections)
  };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
