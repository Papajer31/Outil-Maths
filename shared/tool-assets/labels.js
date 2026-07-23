const DISPLAY_NAMES = Object.freeze({
  emojis: "Émojis",
  alimentation: "Alimentation",
  animaux: "Animaux",
  argent_temps: "Argent et temps",
  bureau: "Bureau",
  celebrations: "Célébrations",
  drapeaux: "Drapeaux",
  jeux_culture: "Jeux et culture",
  meteo: "Météo",
  musique_son: "Musique et son",
  nature: "Nature",
  outils_objets_divers: "Outils et objets divers",
  sports: "Sports",
  symboles: "Symboles",
  technologie: "Technologie",
  tetes: "Têtes",
  vetements_accessoires: "Vêtements et accessoires",
  voyage: "Voyage",
  graphs: "Graphèmes",
  graphemes: "Graphèmes",
  comparaison: "Comparaison",
  monnaie: "Monnaie",
  nombres: "Nombres",
  mains: "Mains",
  picbille: "Picbille",
  representation: "Représentation",
  personnages: "Personnages",
  images: "Images",
  audio: "Audio"
});

export function formatToolAssetFolderName(value, fallback = "Dossier") {
  const key = String(value || "").trim();
  if (!key) return fallback;
  return DISPLAY_NAMES[key]
    || `${key.charAt(0).toLocaleUpperCase("fr")}${key.slice(1).replace(/[_-]+/g, " ")}`;
}

export function formatToolAssetCategory(value, fallback = "Sans catégorie") {
  const parts = String(value || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts.map((part) => formatToolAssetFolderName(part, part)).join(" / ") : fallback;
}
