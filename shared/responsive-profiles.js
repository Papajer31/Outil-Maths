/**
 * Profils viewport officiellement supportés par le runtime élève.
 *
 * Cette liste est partagée par le banc de test et par l'infrastructure
 * responsive du runtime afin d'éviter toute divergence entre les deux.
 */
export const RUNTIME_VIEWPORT_PROFILES = Object.freeze([
  Object.freeze({
    id: "legacy-1024x768",
    width: 1024,
    height: 768,
    label: "1024×768",
    meta: "Vieux PC 4:3",
    ratio: "4-3"
  }),
  Object.freeze({
    id: "legacy-1280x1024",
    width: 1280,
    height: 1024,
    label: "1280×1024",
    meta: "Écran 5:4",
    ratio: "5-4"
  }),
  Object.freeze({
    id: "compact-1280x800",
    width: 1280,
    height: 800,
    label: "1280×800",
    meta: "Tablette / petit écran 16:10",
    ratio: "16-10"
  }),
  Object.freeze({
    id: "compact-1366x768",
    width: 1366,
    height: 768,
    label: "1366×768",
    meta: "Portable bas de gamme",
    ratio: "16-9"
  }),
  Object.freeze({
    id: "standard-1920x1080",
    width: 1920,
    height: 1080,
    label: "1920×1080",
    meta: "Écran standard",
    ratio: "16-9"
  }),
  Object.freeze({
    id: "comfortable-1920x1200",
    width: 1920,
    height: 1200,
    label: "1920×1200",
    meta: "Écran confortable 16:10",
    ratio: "16-10"
  })
]);

export function findRuntimeViewportProfile(width, height) {
  const safeWidth = normalizeDimension(width);
  const safeHeight = normalizeDimension(height);

  return RUNTIME_VIEWPORT_PROFILES.find((profile) => (
    profile.width === safeWidth && profile.height === safeHeight
  )) || null;
}

function normalizeDimension(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}
