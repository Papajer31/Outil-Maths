import { requestAppFullscreen } from "../shared/dom-helpers.js";

const FULLSCREEN_WANTED_KEY = "student.fullscreenWanted";
let hasBoundFullscreenRetry = false;

export function markStudentFullscreenWanted(){
  try {
    sessionStorage.setItem(FULLSCREEN_WANTED_KEY, "1");
  } catch {}

  requestStudentFullscreen();
}

export function isStudentFullscreenWanted(){
  try {
    return sessionStorage.getItem(FULLSCREEN_WANTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function requestStudentFullscreen(){
  if (!isStudentFullscreenWanted()) return;
  requestAppFullscreen();
}

export function bindStudentFullscreenRetry(){
  if (hasBoundFullscreenRetry) return;
  hasBoundFullscreenRetry = true;

  document.addEventListener("pointerdown", () => {
    requestStudentFullscreen();
  }, { capture: true });
}
