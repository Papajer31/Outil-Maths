export function getDefaultSettings() {
  return {
    min: 10,
    max: 69,
    usePicbille: true,
    useDede: true
  };
}

export function normalizeSettings(settings) {
  const s = {
    ...getDefaultSettings(),
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

export function getAvailableCharacters(settings) {
  const cfg = normalizeSettings(settings);
  const available = [];
  if (cfg.usePicbille) available.push("picbille");
  if (cfg.useDede) available.push("dede");
  return available;
}

export function pickQuestion(settings) {
  const cfg = normalizeSettings(settings);
  const availableCharacters = getAvailableCharacters(cfg);

  if (!availableCharacters.length) {
    throw new Error("Aucune représentation active pour ReprésentationDécimale.");
  }

  return {
    n: rand(cfg.min, cfg.max),
    character: pickRandom(availableCharacters)
  };
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
