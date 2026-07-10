import { normalizeDrawingLayerState } from "./model.js";

export function createDrawingLayerControlPanel({ host, getWidget } = {}){
  function render(){
    if (!host) return;
    const state = normalizeDrawingLayerState(getWidget?.()?.state);
    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-drawing-layer-control" aria-label="Contrôles du calque de dessin">
        <div class="tt-control-panel-head">
          <div>
            <h3>Calque de dessin</h3>
            <p>Ce calque a été créé depuis la drawbar de la projection.</p>
          </div>
        </div>
        <div class="tt-control-help-card">
          <strong>${state.paths.length + state.shapes.length}</strong>
          <span>${state.paths.length + state.shapes.length > 1 ? "éléments" : "élément"} dans ce calque.</span>
        </div>
      </section>
    `;
  }

  render();
  return { render, destroy(){} };
}
