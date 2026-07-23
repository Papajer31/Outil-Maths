import { findRuntimeViewportProfile } from "./responsive-profiles.js";

const ROOT_CLASS_PREFIXES = Object.freeze([
  "viewport-profile--",
  "viewport-ratio--",
  "viewport-orientation--"
]);

let frameId = 0;
let currentSnapshot = null;

/**
 * Installe les métadonnées viewport communes sur <html> et <body>.
 *
 * Ce module ne redimensionne aucun contenu et n'applique aucun scale :
 * il expose uniquement des classes, attributs et variables CSS communes.
 */
export function installResponsiveRuntime() {
  updateResponsiveViewport();

  window.addEventListener("resize", scheduleResponsiveViewportUpdate, { passive: true });
  window.addEventListener("orientationchange", scheduleResponsiveViewportUpdate, { passive: true });

  return getResponsiveViewport();
}

export function getResponsiveViewport() {
  return currentSnapshot ? { ...currentSnapshot } : createViewportSnapshot();
}

function scheduleResponsiveViewportUpdate() {
  if (frameId) return;

  frameId = window.requestAnimationFrame(() => {
    frameId = 0;
    updateResponsiveViewport();
  });
}

function updateResponsiveViewport() {
  const nextSnapshot = createViewportSnapshot();
  const hasChanged = !currentSnapshot
    || currentSnapshot.width !== nextSnapshot.width
    || currentSnapshot.height !== nextSnapshot.height
    || currentSnapshot.profileId !== nextSnapshot.profileId;

  currentSnapshot = nextSnapshot;
  applyViewportMetadata(document.documentElement, nextSnapshot);

  if (document.body) {
    applyViewportMetadata(document.body, nextSnapshot);
  }

  if (hasChanged) {
    window.dispatchEvent(new CustomEvent("runtime:viewportchange", {
      detail: { ...nextSnapshot }
    }));
  }
}

function createViewportSnapshot() {
  const width = Math.max(1, Math.round(window.innerWidth || document.documentElement.clientWidth || 1));
  const height = Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || 1));
  const profile = findRuntimeViewportProfile(width, height);
  const orientation = width >= height ? "landscape" : "portrait";
  const ratio = resolveRatio(width, height, profile?.ratio);

  return Object.freeze({
    width,
    height,
    orientation,
    ratio,
    profileId: profile?.id || "custom",
    profileLabel: profile?.label || `${width}×${height}`,
    isOfficialProfile: Boolean(profile)
  });
}

function applyViewportMetadata(element, snapshot) {
  removeManagedClasses(element);

  element.classList.add(
    "runtime-viewport",
    `viewport-profile--${snapshot.profileId}`,
    `viewport-ratio--${snapshot.ratio}`,
    `viewport-orientation--${snapshot.orientation}`
  );

  element.toggleAttribute("data-viewport-official", snapshot.isOfficialProfile);
  element.dataset.viewportProfile = snapshot.profileId;
  element.dataset.viewportWidth = String(snapshot.width);
  element.dataset.viewportHeight = String(snapshot.height);
  element.dataset.viewportRatio = snapshot.ratio;
  element.dataset.viewportOrientation = snapshot.orientation;

  element.style.setProperty("--runtime-viewport-width", `${snapshot.width}px`);
  element.style.setProperty("--runtime-viewport-height", `${snapshot.height}px`);
  element.style.setProperty("--runtime-viewport-ratio", String(snapshot.width / snapshot.height));
}

function removeManagedClasses(element) {
  for (const className of Array.from(element.classList)) {
    if (ROOT_CLASS_PREFIXES.some((prefix) => className.startsWith(prefix))) {
      element.classList.remove(className);
    }
  }
}

function resolveRatio(width, height, officialRatio = "") {
  if (officialRatio) return officialRatio;

  const ratio = width / height;
  const knownRatios = [
    { id: "16-9", value: 16 / 9 },
    { id: "16-10", value: 16 / 10 },
    { id: "4-3", value: 4 / 3 },
    { id: "5-4", value: 5 / 4 }
  ];

  const nearest = knownRatios.reduce((best, candidate) => {
    const distance = Math.abs(candidate.value - ratio);
    return distance < best.distance ? { ...candidate, distance } : best;
  }, { id: "other", value: 0, distance: Number.POSITIVE_INFINITY });

  return nearest.distance <= 0.035 ? nearest.id : "other";
}
