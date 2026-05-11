import { requestStudentFullscreen } from "./student-fullscreen.js";

const OVERLAY_ID = "studentOrientationOverlay";
const HOME_ROUTE = "home";
let hasMountedOrientationGuard = false;
let overlayElement = null;

export function mountStudentOrientationGuard(){
  if (hasMountedOrientationGuard) return;
  hasMountedOrientationGuard = true;

  overlayElement = createOrientationOverlay();
  document.body.appendChild(overlayElement);

  window.addEventListener("hashchange", syncStudentOrientationGuard);
  window.addEventListener("resize", syncStudentOrientationGuard);
  window.addEventListener("orientationchange", syncStudentOrientationGuard);

  try {
    window.matchMedia?.("(orientation: portrait)")?.addEventListener?.("change", syncStudentOrientationGuard);
    window.matchMedia?.("(pointer: coarse)")?.addEventListener?.("change", syncStudentOrientationGuard);
  } catch {}

  syncStudentOrientationGuard();
}

export function syncStudentOrientationGuard(){
  const shouldBlock = shouldBlockForOrientation();
  document.body.classList.toggle("student-orientation-blocked", shouldBlock);

  if (!overlayElement) return;
  overlayElement.hidden = !shouldBlock;
  overlayElement.setAttribute("aria-hidden", shouldBlock ? "false" : "true");
}

function createOrientationOverlay(){
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "student-orientation-overlay";
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="student-orientation-card" role="status" aria-live="polite">
      <div class="student-orientation-icon" aria-hidden="true">↻</div>
      <div class="student-orientation-title">Tourne ton appareil en mode paysage</div>
      <div class="student-orientation-text">Cette page est prévue pour un écran large.</div>
    </div>
  `;

  overlay.addEventListener("pointerdown", () => {
    requestStudentFullscreen();
  }, { capture: true });

  return overlay;
}

function shouldBlockForOrientation(){
  return isMobilePortrait() && getCurrentRouteName() !== HOME_ROUTE;
}

function isMobilePortrait(){
  const hasCoarsePointer = matchesMedia("(pointer: coarse)");
  const isPortrait = matchesMedia("(orientation: portrait)");
  const isSmallScreen = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 800;
  return hasCoarsePointer && isPortrait && isSmallScreen;
}

function matchesMedia(query){
  try {
    return !!window.matchMedia?.(query)?.matches;
  } catch {
    return false;
  }
}

function getCurrentRouteName(){
  const rawHash = String(window.location.hash || "").replace(/^#\/?/, "");
  const [pathPart = ""] = rawHash.split("?");
  return String(pathPart || "").trim() || HOME_ROUTE;
}
