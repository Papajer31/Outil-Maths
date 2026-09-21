// Compatibilité transitoire : le socle Surface n’expose plus de bloc de réglages
// sous la mini-app. Le fond vit désormais dans un panneau annexe dédié et les
// Notes sont pilotées uniquement depuis la fenêtre projetée.
export { createSurfaceBackgroundPanel } from "./background-control.js";
