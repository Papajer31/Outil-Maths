import {
  ANNOTATION_COLORS,
  MAX_ANNOTATION_ERASER_WIDTH,
  MAX_ANNOTATION_WIDTH,
  MIN_ANNOTATION_ERASER_WIDTH,
  MIN_ANNOTATION_WIDTH,
  normalizeAnnotationState
} from "./annotations.js";

const MIN_POINT_DISTANCE_PX = 1.8;
const MAX_DEVICE_PIXEL_RATIO = 2.5;

function escapeAttr(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function drawingToolMeta(tool){
  return tool === "line"
    ? { id: "line", label: "Trait", icon: "horizontal_rule" }
    : { id: "pen", label: "Crayon", icon: "edit" };
}

export function createAnnotationProjector({ stage, layer, toolbar, onAction, launcherPosition, onLauncherPositionChange } = {}){
  let state = normalizeAnnotationState();
  let activePointerId = null;
  let draftPoints = [];
  let draftTool = "pen";
  let resizeObserver = null;
  let eraserCursor = null;
  let toolMenuOpen = false;
  let colorMenuOpen = false;
  let noteLauncherPosition = normalizeLauncherPosition(launcherPosition);
  let suppressToggleClick = false;

  function normalizeLauncherPosition(value){
    const x = Number(value?.x);
    const y = Number(value?.y);
    return {
      x: Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0.04,
      y: Number.isFinite(y) ? Math.max(0, Math.min(1, y)) : 0.08
    };
  }

  function getRect(){
    return stage?.getBoundingClientRect?.() || { width: 1, height: 1, left: 0, top: 0 };
  }

  function getContext(){
    return layer?.getContext?.("2d") || null;
  }

  function normalizedPoint(event){
    const rect = getRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))
    };
  }

  function cssPoint(point){
    const rect = getRect();
    return {
      x: (Number(point?.x) || 0) * rect.width,
      y: (Number(point?.y) || 0) * rect.height
    };
  }

  function resizeCanvas(){
    if (!layer) return;
    const rect = getRect();
    const ratio = Math.max(1, Math.min(MAX_DEVICE_PIXEL_RATIO, Number(window.devicePixelRatio) || 1));
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (layer.width !== width) layer.width = width;
    if (layer.height !== height) layer.height = height;
    layer.style.width = `${Math.max(1, rect.width)}px`;
    layer.style.height = `${Math.max(1, rect.height)}px`;
    const ctx = getContext();
    if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function clearCanvas(){
    const ctx = getContext();
    if (!ctx || !layer) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.restore();
  }

  function drawStroke(stroke){
    const ctx = getContext();
    const rect = getRect();
    const points = Array.isArray(stroke?.points) ? stroke.points : [];
    if (!ctx || !points.length) return;

    const isEraser = stroke.tool === "eraser";
    const minDim = Math.max(1, Math.min(rect.width, rect.height));
    const lineWidth = Math.max(isEraser ? 10 : 2, (Number(stroke.width) || 0.0045) * minDim);
    const first = cssPoint(points[0]);

    ctx.save();
    ctx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
    ctx.strokeStyle = isEraser ? "rgba(0,0,0,1)" : String(stroke.color || "#dc2626");
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(first.x, first.y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const point = cssPoint(points[index]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function renderStrokes(){
    resizeCanvas();
    clearCanvas();
    state.strokes.forEach(drawStroke);
  }

  function ensureEraserCursor(){
    if (eraserCursor?.isConnected) return eraserCursor;
    if (!stage) return null;
    eraserCursor = document.createElement("div");
    eraserCursor.className = "ttp-eraser-cursor";
    eraserCursor.hidden = true;
    stage.appendChild(eraserCursor);
    return eraserCursor;
  }

  function updateEraserCursor(event, visible = true){
    const cursor = ensureEraserCursor();
    if (!cursor) return;
    const shouldShow = visible && state.enabled && state.tool === "eraser";
    cursor.hidden = !shouldShow;
    if (!shouldShow || !event) return;
    const rect = getRect();
    const minDim = Math.max(1, Math.min(rect.width, rect.height));
    const size = Math.max(18, state.eraserWidth * minDim);
    cursor.style.width = `${size}px`;
    cursor.style.height = `${size}px`;
    cursor.style.left = `${event.clientX - rect.left}px`;
    cursor.style.top = `${event.clientY - rect.top}px`;
  }

  function applyToolbarPosition(){
    if (!toolbar || !stage || toolbar.hidden) return;
    const stageRect = getRect();
    if (!stageRect.width || !stageRect.height) return;
    const opensLeft = noteLauncherPosition.x > 0.56;
    const opensDown = noteLauncherPosition.y < 0.34;
    toolbar.classList.toggle("opens-left", opensLeft);
    toolbar.classList.toggle("opens-down", opensDown);
    // Mesure le bouton d’ouverture lui-même : sa position est l’ancre logique,
    // quelle que soit la largeur de la palette ouverte.
    const toggle = toolbar.querySelector("[data-note-toggle]");
    const toolbarWidth = Math.max(1, toolbar.offsetWidth || 1);
    const toolbarHeight = Math.max(1, toolbar.offsetHeight || 1);
    const toggleCenterX = toggle ? toggle.offsetLeft + toggle.offsetWidth / 2 : toolbarWidth / 2;
    const anchorX = noteLauncherPosition.x * stageRect.width;
    const anchorY = noteLauncherPosition.y * stageRect.height;
    let left = anchorX - toggleCenterX;
    let top = anchorY - toolbarHeight / 2;
    const margin = 8;
    left = Math.max(margin, Math.min(stageRect.width - toolbarWidth - margin, left));
    top = Math.max(margin, Math.min(stageRect.height - toolbarHeight - margin, top));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  function bindLauncherDrag(){
    const toggle = toolbar?.querySelector?.("[data-note-toggle]");
    if (!toggle) return;
    toggle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const rect = getRect();
      const startX = event.clientX;
      const startY = event.clientY;
      let dragged = false;
      let next = { ...noteLauncherPosition };

      const move = (moveEvent) => {
        const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (!dragged && distance < 7) return;
        dragged = true;
        next = normalizeLauncherPosition({
          x: (moveEvent.clientX - rect.left) / Math.max(1, rect.width),
          y: (moveEvent.clientY - rect.top) / Math.max(1, rect.height)
        });
        noteLauncherPosition = next;
        applyToolbarPosition();
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
      };
      const end = (endEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        try { toggle.releasePointerCapture?.(event.pointerId); } catch {}
        if (dragged) {
          suppressToggleClick = true;
          onLauncherPositionChange?.({ ...noteLauncherPosition });
          endEvent.preventDefault();
          endEvent.stopPropagation();
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end, { passive: false });
      window.addEventListener("pointercancel", end, { passive: false });
      try { toggle.setPointerCapture?.(event.pointerId); } catch {}
    }, { passive: true });
  }

  function renderToolbar(){
    if (!toolbar) return;
    if (!state.enabled) {
      toolMenuOpen = false;
      colorMenuOpen = false;
      toolbar.classList.remove("is-open");
      toolbar.innerHTML = `
        <button class="ttp-note-toggle" type="button" data-note-toggle aria-label="Activer les notes" title="Notes">
          <span class="ttp-material-icon" aria-hidden="true">edit_note</span>
        </button>
      `;
    } else {
      const isEraser = state.tool === "eraser";
      const drawingTool = drawingToolMeta(isEraser ? state.lastDrawingTool : state.tool);
      const alternateTool = drawingToolMeta(drawingTool.id === "pen" ? "line" : "pen");
      const currentColor = ANNOTATION_COLORS.find((item) => item.value === state.color) || ANNOTATION_COLORS[0];
      toolbar.classList.add("is-open");
      toolbar.innerHTML = `
        <button class="ttp-note-toggle is-active" type="button" data-note-toggle aria-label="Terminer les notes" title="Terminer les notes">
          <span class="ttp-material-icon" aria-hidden="true">check</span>
        </button>

        <div class="ttp-note-popover-slot">
          <button class="ttp-note-color-trigger" type="button" data-note-color-trigger aria-label="Couleur : ${escapeAttr(currentColor.label)}" title="Couleur" aria-expanded="${colorMenuOpen ? "true" : "false"}">
            <span class="ttp-note-color-dot" style="--note-color:${escapeAttr(currentColor.value)}"></span>
          </button>
          <div class="ttp-note-flyout ttp-note-color-menu" data-note-color-menu ${colorMenuOpen ? "" : "hidden"} aria-label="Choisir une couleur">
            ${ANNOTATION_COLORS.map((item) => `
              <button class="ttp-note-color${state.color === item.value ? " is-selected" : ""}" type="button" data-note-color="${escapeAttr(item.value)}" aria-label="${escapeAttr(item.label)}" title="${escapeAttr(item.label)}">
                <span style="--note-color:${escapeAttr(item.value)}"></span>
              </button>
            `).join("")}
          </div>
        </div>

        <div class="ttp-note-popover-slot">
          <button class="ttp-note-action ttp-note-drawing-trigger${!isEraser ? " is-selected" : ""}" type="button" data-note-drawing-trigger aria-label="${escapeAttr(drawingTool.label)}" title="${escapeAttr(drawingTool.label)}" aria-expanded="${toolMenuOpen ? "true" : "false"}">
            <span class="ttp-material-icon" aria-hidden="true">${escapeAttr(drawingTool.icon)}</span>
          </button>
          <div class="ttp-note-flyout ttp-note-tool-menu" data-note-tool-menu ${toolMenuOpen ? "" : "hidden"}>
            <button class="ttp-note-action" type="button" data-note-tool-choice="${escapeAttr(alternateTool.id)}" aria-label="${escapeAttr(alternateTool.label)}" title="${escapeAttr(alternateTool.label)}">
              <span class="ttp-material-icon" aria-hidden="true">${escapeAttr(alternateTool.icon)}</span>
            </button>
          </div>
        </div>

        <button class="ttp-note-action${isEraser ? " is-selected" : ""}" type="button" data-note-eraser aria-label="Gomme" title="Gomme">
          <span class="ttp-material-icon" aria-hidden="true">ink_eraser</span>
        </button>

        ${isEraser ? `
          <label class="ttp-note-slider" title="Diamètre de la gomme">
            <span>Diamètre</span>
            <input type="range" data-note-eraser-width min="${MIN_ANNOTATION_ERASER_WIDTH}" max="${MAX_ANNOTATION_ERASER_WIDTH}" step="0.002" value="${state.eraserWidth}" aria-label="Diamètre de la gomme">
          </label>
        ` : `
          <label class="ttp-note-slider" title="Épaisseur du trait">
            <span>Épaisseur</span>
            <input type="range" data-note-pen-width min="${MIN_ANNOTATION_WIDTH}" max="${MAX_ANNOTATION_WIDTH}" step="0.0005" value="${state.width}" aria-label="Épaisseur du trait">
          </label>
        `}

        <button class="ttp-note-action" type="button" data-note-undo aria-label="Annuler" title="Annuler" ${state.history.length ? "" : "disabled"}><span class="ttp-material-icon" aria-hidden="true">undo</span></button>
        <button class="ttp-note-action is-danger" type="button" data-note-clear aria-label="Effacer toutes les notes" title="Effacer toutes les notes" ${state.strokes.length ? "" : "disabled"}><span class="ttp-material-icon" aria-hidden="true">delete_sweep</span></button>
      `;
    }

    toolbar.querySelector("[data-note-toggle]")?.addEventListener("click", () => {
      if (suppressToggleClick) { suppressToggleClick = false; return; }
      onAction?.("annotations:set-enabled", { enabled: !state.enabled });
    });
    bindLauncherDrag();
    requestAnimationFrame(applyToolbarPosition);

    toolbar.querySelector("[data-note-color-trigger]")?.addEventListener("click", () => {
      toolMenuOpen = false;
      colorMenuOpen = !colorMenuOpen;
      if (state.tool === "eraser") {
        onAction?.("annotations:set-tool", { tool: state.lastDrawingTool });
      } else {
        renderToolbar();
      }
    });

    toolbar.querySelectorAll("[data-note-color]").forEach((button) => button.addEventListener("click", () => {
      colorMenuOpen = false;
      toolMenuOpen = false;
      onAction?.("annotations:set-color", { color: button.dataset.noteColor });
    }));

    toolbar.querySelector("[data-note-drawing-trigger]")?.addEventListener("click", () => {
      colorMenuOpen = false;
      if (state.tool === "eraser") {
        toolMenuOpen = false;
        onAction?.("annotations:set-tool", { tool: state.lastDrawingTool });
        return;
      }
      toolMenuOpen = !toolMenuOpen;
      renderToolbar();
    });

    toolbar.querySelectorAll("[data-note-tool-choice]").forEach((button) => button.addEventListener("click", () => {
      toolMenuOpen = false;
      colorMenuOpen = false;
      onAction?.("annotations:set-tool", { tool: button.dataset.noteToolChoice });
    }));

    toolbar.querySelector("[data-note-eraser]")?.addEventListener("click", () => {
      toolMenuOpen = false;
      colorMenuOpen = false;
      if (state.tool !== "eraser") onAction?.("annotations:set-tool", { tool: "eraser" });
      else renderToolbar();
    });

    // On valide les sliders au relâchement : un rendu complet remplace la
    // barre d’outils, donc le faire à chaque pixel casserait le glissement.
    toolbar.querySelector("[data-note-pen-width]")?.addEventListener("change", (event) => onAction?.("annotations:set-width", { width: Number(event.currentTarget.value) }));
    toolbar.querySelector("[data-note-eraser-width]")?.addEventListener("change", (event) => onAction?.("annotations:set-eraser-width", { width: Number(event.currentTarget.value) }));
    toolbar.querySelector("[data-note-undo]")?.addEventListener("click", () => onAction?.("annotations:undo"));
    toolbar.querySelector("[data-note-clear]")?.addEventListener("click", () => onAction?.("annotations:clear"));
  }

  function syncInteractivity(){
    if (!layer) return;
    layer.classList.toggle("is-active", state.enabled);
    layer.classList.toggle("is-eraser", state.enabled && state.tool === "eraser");
    layer.style.pointerEvents = state.enabled ? "auto" : "none";
    layer.setAttribute("aria-hidden", state.enabled ? "false" : "true");
    if (!state.enabled || state.tool !== "eraser") updateEraserCursor(null, false);
  }

  function render(nextState = state){
    state = normalizeAnnotationState(nextState);
    if (!state.enabled) {
      toolMenuOpen = false;
      colorMenuOpen = false;
    }
    syncInteractivity();
    renderStrokes();
    renderToolbar();
  }

  function drawDraftSegment(previous, next){
    const tool = draftTool === "eraser" ? "eraser" : "pen";
    drawStroke({
      tool,
      color: state.color,
      width: tool === "eraser" ? state.eraserWidth : state.width,
      points: previous ? [previous, next] : [next]
    });
  }

  function onPointerDown(event){
    if (!state.enabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointerId = event.pointerId;
    draftTool = state.tool;
    toolMenuOpen = false;
    colorMenuOpen = false;
    renderToolbar();
    try { layer?.setPointerCapture?.(event.pointerId); } catch {}
    const point = normalizedPoint(event);
    draftPoints = [point];
    if (draftTool !== "line") drawDraftSegment(null, point);
    updateEraserCursor(event, true);
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event){
    updateEraserCursor(event, true);
    if (event.pointerId !== activePointerId) return;
    const rect = getRect();
    const next = normalizedPoint(event);

    if (draftTool === "line") {
      const start = draftPoints[0];
      const prev = draftPoints[draftPoints.length - 1] || start;
      const dx = (next.x - prev.x) * rect.width;
      const dy = (next.y - prev.y) * rect.height;
      if (draftPoints.length === 1 || Math.hypot(dx, dy) >= MIN_POINT_DISTANCE_PX) {
        draftPoints = [start, next];
        renderStrokes();
        drawStroke({ tool: "line", color: state.color, width: state.width, points: draftPoints });
      }
    } else {
      const prev = draftPoints[draftPoints.length - 1];
      const dx = (next.x - prev.x) * rect.width;
      const dy = (next.y - prev.y) * rect.height;
      if (Math.hypot(dx, dy) >= MIN_POINT_DISTANCE_PX) {
        draftPoints.push(next);
        drawDraftSegment(prev, next);
      }
    }

    event.preventDefault();
    event.stopPropagation();
  }

  function finishPointer(event){
    if (event.pointerId !== activePointerId) return;
    try { layer?.releasePointerCapture?.(activePointerId); } catch {}
    const shouldCommit = draftTool === "line" ? draftPoints.length >= 2 : draftPoints.length > 0;
    if (shouldCommit) {
      onAction?.("annotations:add-stroke", {
        stroke: {
          id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          tool: draftTool,
          color: state.color,
          width: draftTool === "eraser" ? state.eraserWidth : state.width,
          points: draftPoints
        }
      });
    } else if (draftTool === "line") {
      renderStrokes();
    }
    activePointerId = null;
    draftPoints = [];
    updateEraserCursor(event, false);
    event.preventDefault();
    event.stopPropagation();
  }

  function cancelPointer(event){
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    draftPoints = [];
    updateEraserCursor(event, false);
    renderStrokes();
  }

  layer?.addEventListener("pointerdown", onPointerDown, { passive: false });
  layer?.addEventListener("pointermove", onPointerMove, { passive: false });
  layer?.addEventListener("pointerup", finishPointer, { passive: false });
  layer?.addEventListener("pointercancel", cancelPointer, { passive: false });
  layer?.addEventListener("pointerleave", (event) => {
    if (event.pointerId !== activePointerId) updateEraserCursor(event, false);
  });
  if (typeof ResizeObserver === "function" && stage) {
    resizeObserver = new ResizeObserver(() => { renderStrokes(); applyToolbarPosition(); });
    resizeObserver.observe(stage);
  }

  render(state);
  return {
    render,
    setLauncherPosition(next){
      noteLauncherPosition = normalizeLauncherPosition(next);
      applyToolbarPosition();
    },
    destroy(){
      resizeObserver?.disconnect?.();
      resizeObserver = null;
      layer?.removeEventListener("pointerdown", onPointerDown);
      layer?.removeEventListener("pointermove", onPointerMove);
      layer?.removeEventListener("pointerup", finishPointer);
      layer?.removeEventListener("pointercancel", cancelPointer);
      clearCanvas();
      eraserCursor?.remove?.();
      eraserCursor = null;
      if (toolbar) toolbar.innerHTML = "";
    }
  };
}
