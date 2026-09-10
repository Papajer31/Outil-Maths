import {
  SEYES_FONT_CM,
  SEYES_FONT_GS,
  SEYES_ZOOM_MAX,
  SEYES_ZOOM_MIN,
  SEYES_ZOOM_STEP,
  applySeyesAction,
  normalizeSeyesState
} from "./model.js";

function formatZoom(value){
  return `${Math.round((Number(value) || 1) * 100)} %`;
}

export function createSeyesControlPanel({ host, getWidget, updateWidget, showToast } = {}){
  function getCurrentState(){
    return normalizeSeyesState(getWidget?.()?.state);
  }

  function commitSettings(patch = {}, { renderAfter = true } = {}){
    const result = applySeyesAction({
      action: "set-settings",
      payload: patch,
      state: getCurrentState()
    });
    if (!result) return;
    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return;
    }
    if (result.patch) updateWidget?.(result.patch, { renderPanel: renderAfter, sync: true });
  }

  function render(){
    if (!host) return;
    const state = getCurrentState();
    const zoomPercent = Math.round(state.zoom * 100);

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-seyes-control" aria-label="Contrôles du widget Seyès">
        <div class="tt-control-panel-head">
          <div>
            <h3>Seyès</h3>
            <p>Le texte et sa mise en forme s’éditent directement dans la projection.</p>
          </div>
        </div>

        <div class="tt-seyes-settings-grid">
          <section class="tt-seyes-settings-section" aria-label="Police d’écriture">
            <div class="tt-seyes-section-title">Belle Allure</div>
            <div class="tt-widget-action-bar tt-seyes-font-buttons">
              <button class="tt-widget-action-btn${state.fontSet === SEYES_FONT_GS ? " is-primary" : ""}" type="button" data-seyes-font="${SEYES_FONT_GS}" aria-pressed="${state.fontSet === SEYES_FONT_GS}">GS</button>
              <button class="tt-widget-action-btn${state.fontSet === SEYES_FONT_CM ? " is-primary" : ""}" type="button" data-seyes-font="${SEYES_FONT_CM}" aria-pressed="${state.fontSet === SEYES_FONT_CM}">CM</button>
            </div>
          </section>

          <section class="tt-seyes-settings-section" aria-label="Zoom du cahier">
            <div class="tt-seyes-section-title">
              <span>Zoom</span>
              <strong>${formatZoom(state.zoom)}</strong>
            </div>
            <input
              id="ttSeyesZoom"
              class="tt-seyes-zoom-range"
              type="range"
              min="${SEYES_ZOOM_MIN * 100}"
              max="${SEYES_ZOOM_MAX * 100}"
              step="${SEYES_ZOOM_STEP * 100}"
              value="${zoomPercent}"
              aria-label="Zoom du cahier Seyès"
            >
          </section>
        </div>
      </section>
    `;

    host.querySelectorAll("[data-seyes-font]").forEach((button) => {
      button.addEventListener("click", () => {
        commitSettings({ fontSet: button.dataset.seyesFont });
      });
    });

    const zoomInput = host.querySelector("#ttSeyesZoom");
    zoomInput?.addEventListener("input", () => {
      commitSettings({ zoom: Number(zoomInput.value) / 100 }, { renderAfter: false });
    });
    zoomInput?.addEventListener("change", () => render());
  }

  render();
  return {
    render,
    destroy(){
      if (host) host.innerHTML = "";
    }
  };
}
