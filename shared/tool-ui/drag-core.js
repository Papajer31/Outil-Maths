/**
 * Helpers communs pour les interactions de déplacement dans les runtimes d'outils.
 *
 * Objectifs :
 * - utiliser Pointer Events pour souris / tactile / stylet ;
 * - corriger les coordonnées quand le runtime est affiché dans un conteneur redimensionné ;
 * - éviter les sélections de texte et le drag fantôme navigateur ;
 * - garder les éléments dans leur surface de travail ;
 * - distinguer proprement clic court et déplacement réel.
 */

const DEFAULT_DRAG_THRESHOLD_PX = 6;

export function getElementClientScale(element) {
  const rect = element?.getBoundingClientRect?.();
  const width = Math.max(1, element?.clientWidth || element?.offsetWidth || 1);
  const height = Math.max(1, element?.clientHeight || element?.offsetHeight || 1);
  return {
    x: Math.max(0.0001, (rect?.width || width) / width),
    y: Math.max(0.0001, (rect?.height || height) / height)
  };
}

export function clientPointToLocalPoint(element, clientX, clientY) {
  const rect = element?.getBoundingClientRect?.();
  if (!element || !rect) return { x: 0, y: 0 };
  const scale = getElementClientScale(element);
  return {
    x: (Number(clientX) - rect.left - (element.clientLeft || 0)) / scale.x,
    y: (Number(clientY) - rect.top - (element.clientTop || 0)) / scale.y
  };
}

export function localPointToClientPoint(element, localX, localY) {
  const rect = element?.getBoundingClientRect?.();
  if (!element || !rect) return { x: 0, y: 0 };
  const scale = getElementClientScale(element);
  return {
    x: rect.left + (element.clientLeft || 0) + (Number(localX) || 0) * scale.x,
    y: rect.top + (element.clientTop || 0) + (Number(localY) || 0) * scale.y
  };
}

export function clientRectToLocalRect(surface, rect) {
  const scale = getElementClientScale(surface);
  const topLeft = clientPointToLocalPoint(surface, rect?.left || 0, rect?.top || 0);
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: Math.max(1, (rect?.width || 1) / scale.x),
    height: Math.max(1, (rect?.height || 1) / scale.y)
  };
}

export function isClientPointInsideElement(element, clientX, clientY) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return false;
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

export function bindFreeDrag(element, options = {}) {
  if (!element) return () => {};

  const threshold = readNumber(options.threshold, DEFAULT_DRAG_THRESHOLD_PX);
  const dragClasses = normalizeClassList(options.dragClass ?? options.dragClasses ?? "is-dragging");
  const disabled = typeof options.disabled === "function" ? options.disabled : () => !!options.disabled;
  const resolveSurface = typeof options.surface === "function" ? options.surface : () => options.surface;
  const signal = options.signal;
  const positionElement = options.positionElement !== false;

  let pointerId = null;
  let startClientX = 0;
  let startClientY = 0;
  let drag = null;
  let destroyed = false;

  element.draggable = false;
  element.addEventListener("dragstart", preventDefault, { signal });

  const onPointerDown = (event) => {
    if (destroyed || disabled(event)) return;
    if (event.button != null && event.button !== 0) return;

    const surface = resolveSurface(event);
    if (!surface) return;

    event.preventDefault();
    pointerId = event.pointerId;
    startClientX = event.clientX;
    startClientY = event.clientY;
    drag = null;

    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {}

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd, { passive: false });
    window.addEventListener("pointercancel", onPointerEnd, { passive: false });
  };

  const onPointerMove = (event) => {
    if (destroyed || pointerId !== event.pointerId) return;
    if (disabled(event)) {
      finishPointer(event, { cancel: true });
      return;
    }

    event.preventDefault();

    if (!drag) {
      const distance = Math.hypot(event.clientX - startClientX, event.clientY - startClientY);
      if (distance < threshold) return;
      drag = startDrag(event);
      if (!drag) {
        finishPointer(event, { cancel: true });
        return;
      }
    }

    updateDrag(event);
  };

  const onPointerEnd = (event) => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault();

    if (!drag) {
      options.onClick?.({
        element,
        event,
        startClientX,
        startClientY
      });
    } else {
      updateDrag(event);
      options.onEnd?.({
        element,
        event,
        surface: drag.surface,
        x: drag.x,
        y: drag.y,
        width: drag.width,
        height: drag.height,
        moved: true
      });
    }

    finishPointer(event);
  };

  function startDrag(event) {
    const surface = resolveSurface(event);
    if (!surface) return null;

    const elementRect = element.getBoundingClientRect();
    const localRect = clientRectToLocalRect(surface, elementRect);
    const pointerLocal = clientPointToLocalPoint(surface, event.clientX, event.clientY);
    const nextZ = typeof options.zIndex === "function" ? options.zIndex({ element, event, surface }) : options.zIndex;

    if (positionElement) setElementPositionWithoutTransition(element, localRect.left, localRect.top);
    if (nextZ != null) element.style.zIndex = String(nextZ);
    dragClasses.forEach((className) => element.classList.add(className));

    const nextDrag = {
      surface,
      pointerOffsetX: pointerLocal.x - localRect.left,
      pointerOffsetY: pointerLocal.y - localRect.top,
      width: localRect.width,
      height: localRect.height,
      x: localRect.left,
      y: localRect.top
    };

    options.onStart?.({
      element,
      event,
      surface,
      x: nextDrag.x,
      y: nextDrag.y,
      width: nextDrag.width,
      height: nextDrag.height
    });

    return nextDrag;
  }

  function updateDrag(event) {
    if (!drag) return;
    const pointerLocal = clientPointToLocalPoint(drag.surface, event.clientX, event.clientY);
    const maxLeft = Math.max(0, (drag.surface.clientWidth || drag.surface.offsetWidth || 0) - drag.width);
    const maxTop = Math.max(0, (drag.surface.clientHeight || drag.surface.offsetHeight || 0) - drag.height);
    const x = clamp(pointerLocal.x - drag.pointerOffsetX, 0, maxLeft);
    const y = clamp(pointerLocal.y - drag.pointerOffsetY, 0, maxTop);

    drag.x = x;
    drag.y = y;
    if (positionElement) {
      element.style.left = toCssPx(x);
      element.style.top = toCssPx(y);
    }

    options.onMove?.({
      element,
      event,
      surface: drag.surface,
      x,
      y,
      width: drag.width,
      height: drag.height
    });
  }

  function finishPointer(event, { cancel = false } = {}) {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);

    try {
      element.releasePointerCapture?.(event.pointerId);
    } catch {}

    if (drag) {
      dragClasses.forEach((className) => element.classList.remove(className));
      if (cancel) {
        options.onCancel?.({
          element,
          event,
          surface: drag.surface,
          x: drag.x,
          y: drag.y,
          width: drag.width,
          height: drag.height
        });
      }
    }

    pointerId = null;
    drag = null;
  }

  element.addEventListener("pointerdown", onPointerDown, { signal, passive: false });

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    dragClasses.forEach((className) => element.classList.remove(className));
    pointerId = null;
    drag = null;
  };

  signal?.addEventListener?.("abort", destroy, { once: true });
  return destroy;
}

function setElementPositionWithoutTransition(element, left, top) {
  if (!element) return;

  const previousTransition = element.style.transition;
  element.style.transition = "none";
  element.style.left = toCssPx(left);
  element.style.top = toCssPx(top);
  element.style.transform = "none";

  // Force l'application immédiate du changement de repère.
  // Sans cela, un élément initialement centré avec transform: translate(-50%, -50%)
  // peut animer ce transform au premier drag et produire un petit sursaut.
  void element.offsetWidth;

  requestAnimationFrame(() => {
    if (previousTransition) {
      element.style.transition = previousTransition;
    } else {
      element.style.removeProperty("transition");
    }
  });
}

function toCssPx(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0px";
  return `${Math.round(n * 1000) / 1000}px`;
}

function normalizeClassList(value) {
  if (Array.isArray(value)) return value.flatMap(normalizeClassList).filter(Boolean);
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function preventDefault(event) {
  event.preventDefault();
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
