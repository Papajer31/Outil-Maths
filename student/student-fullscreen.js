import { requestAppFullscreen } from "../shared/dom-helpers.js";

const FULLSCREEN_WANTED_KEY = "student.fullscreenWanted";
let hasBoundFullscreenRetry = false;
let fullscreenSuppressed = false;

export function setStudentFullscreenSuppressed(value){
  fullscreenSuppressed = value === true;
  if (!fullscreenSuppressed) return;

  try {
    sessionStorage.removeItem(FULLSCREEN_WANTED_KEY);
  } catch {}
}

export function markStudentFullscreenWanted(){
  if (fullscreenSuppressed) return;

  try {
    sessionStorage.setItem(FULLSCREEN_WANTED_KEY, "1");
  } catch {}

  requestStudentFullscreen();
}

export async function markStudentFullscreenWantedAndWait(){
  if (fullscreenSuppressed) return false;

  try {
    sessionStorage.setItem(FULLSCREEN_WANTED_KEY, "1");
  } catch {}

  await Promise.race([
    requestStudentFullscreen(),
    delay(1400)
  ]);

  await delay(180);
  return !!document.fullscreenElement;
}

export function isStudentFullscreenWanted(){
  if (fullscreenSuppressed) return false;

  try {
    return sessionStorage.getItem(FULLSCREEN_WANTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function requestStudentFullscreen(){
  if (fullscreenSuppressed) return Promise.resolve(false);
  if (!isStudentFullscreenWanted()) return Promise.resolve(false);
  return requestAppFullscreen();
}

export function bindStudentFullscreenRetry(){
  if (hasBoundFullscreenRetry) return;
  hasBoundFullscreenRetry = true;

  document.addEventListener("pointerdown", () => {
    requestStudentFullscreen();
  }, { capture: true });
}

function delay(duration){
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(duration) || 0));
  });
}
