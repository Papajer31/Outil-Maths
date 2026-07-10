/*
  Helpers communs pour l'affichage des nombres dans les runtimes de calcul.

  La valeur interne reste sans séparateur pour simplifier la saisie et la
  correction. L'affichage ajoute une espace fine insécable entre les milliers.
*/

export const THIN_NBSP = "\u202F";

export function stripIntegerSeparators(value) {
  return String(value ?? "").replace(/[\s\u00a0\u202f']/g, "");
}

export function parseIntegerLike(value) {
  const raw = stripIntegerSeparators(value).trim();
  if (!/^-?\d+$/.test(raw)) return NaN;
  return Math.floor(Number(raw));
}

export function countIntegerDigits(value) {
  const digits = stripIntegerSeparators(value).replace(/\D+/g, "");
  return digits.length || 1;
}

export function formatIntegerForDisplay(value) {
  const raw = stripIntegerSeparators(value).trim();
  if (!raw) return "";

  const sign = raw.startsWith("-") ? "-" : "";
  const digits = sign ? raw.slice(1).replace(/\D+/g, "") : raw.replace(/\D+/g, "");
  if (!digits) return "";

  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_NBSP)}`;
}

export function getFormattedLength(value) {
  return formatIntegerForDisplay(value).length;
}
