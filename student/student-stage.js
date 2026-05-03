export const STUDENT_STAGE_WIDTH = 1920;
export const STUDENT_STAGE_HEIGHT = 1080;

export function attachStudentStageFit({
  shell,
  viewport,
  fitHost,
  frame,
  scene,
  signal,
  designWidth = STUDENT_STAGE_WIDTH,
  designHeight = STUDENT_STAGE_HEIGHT
} = {}) {
  const supportsCssZoom = typeof document?.documentElement?.style?.zoom !== "undefined";
  let resizeObserver = null;

  function update() {
    if (!viewport || !fitHost || !frame || !scene) return;

    const rect = viewport.getBoundingClientRect();
    const viewportWidth = Math.max(0, rect.width || viewport.clientWidth || 0);
    const viewportHeight = Math.max(0, rect.height || viewport.clientHeight || 0);
    if (viewportWidth <= 0 || viewportHeight <= 0) return;

    const scale = Math.min(
      viewportWidth / designWidth,
      viewportHeight / designHeight,
      1
    );
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const scaledWidth = Math.max(1, Math.round(designWidth * safeScale));
    const scaledHeight = Math.max(1, Math.round(designHeight * safeScale));

    fitHost.style.setProperty("--student-stage-fit-width", `${scaledWidth}px`);
    fitHost.style.setProperty("--student-stage-fit-height", `${scaledHeight}px`);
    fitHost.style.setProperty("--student-stage-fit-scale", String(safeScale));
    shell?.style?.setProperty("--student-stage-fit-scale", String(safeScale));

    frame.style.width = `${scaledWidth}px`;
    frame.style.height = `${scaledHeight}px`;
    scene.style.width = `${designWidth}px`;
    scene.style.height = `${designHeight}px`;
    scene.style.transformOrigin = "top left";

    if (supportsCssZoom) {
      scene.style.zoom = String(safeScale);
      scene.style.transform = "";
    } else {
      scene.style.zoom = "";
      scene.style.transform = safeScale === 1 ? "" : `scale(${safeScale})`;
    }

    shell?.classList.toggle("student-stage-fit-active", safeScale < 0.999);
    shell?.classList.toggle("student-stage-fit-fallback", !supportsCssZoom);
  }

  function disconnect() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  }

  if (typeof ResizeObserver === "function" && viewport) {
    resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(viewport);
  }

  window.addEventListener("resize", update, { signal, passive: true });
  window.addEventListener("orientationchange", update, { signal, passive: true });
  document.addEventListener("fullscreenchange", update, { signal });

  update();

  return {
    update,
    cleanup: disconnect,
    supportsCssZoom
  };
}
