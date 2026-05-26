import {
  buildTeacherToolsProjectorUrl,
  createTeacherToolsChannel,
  createTeacherToolsChannelId
} from "../teacher-tools/channel.js";
import {
  getTeacherTool,
  listTeacherTools
} from "../teacher-tools/registry.js";
import {
  bindSelect,
  renderSelectControl
} from "../../../shared/config-widgets.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const SCENE_BACKGROUNDS = Object.freeze([
  { id: "space", label: "Espace" },
  { id: "white", label: "Blanc" },
  { id: "black", label: "Noir" },
  { id: "blue", label: "Bleu nuit" },
  { id: "green", label: "Tableau vert" },
  { id: "seyes", label: "Seyès léger" }
]);

const DEFAULT_WIDGET_LAYOUTS = Object.freeze({
  "random-student": { x: 0.30, y: 0.26, width: 0.40, height: 0.30 }
});

const SCENE_VERSION = 1;

function normalizeToolId(value){
  return String(value || "").trim();
}

function clamp01(value, fallback = 0){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizeLayout(layout, toolId){
  const fallback = DEFAULT_WIDGET_LAYOUTS[toolId] || { x: 0.08, y: 0.10, width: 0.34, height: 0.24 };
  const width = Math.max(0.12, Math.min(0.96, Number(layout?.width) || fallback.width));
  const height = Math.max(0.10, Math.min(0.90, Number(layout?.height) || fallback.height));
  return {
    x: Math.min(1 - width, clamp01(layout?.x, fallback.x)),
    y: Math.min(1 - height, clamp01(layout?.y, fallback.y)),
    width,
    height
  };
}

function createWidgetId(toolId){
  return `${toolId}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function getNextWidgetZIndex(widgets = []){
  return (Array.isArray(widgets) ? widgets : []).reduce((max, widget, index) => (
    Math.max(max, Number(widget?.zIndex) || index + 1)
  ), 0) + 1;
}

function normalizeWidgetZIndex(widget, index = 0){
  return Math.max(1, Math.trunc(Number(widget?.zIndex) || index + 1));
}

function createWidget(toolId, { widgets = [] } = {}){
  const tool = getTeacherTool(toolId) || getTeacherTool("random-student") || listTeacherTools()[0] || null;
  const safeToolId = tool?.id || "random-student";
  return {
    id: createWidgetId(safeToolId),
    toolId: safeToolId,
    label: tool?.label || "Widget",
    icon: tool?.icon || "widgets",
    visible: true,
    zIndex: getNextWidgetZIndex(widgets),
    layout: normalizeLayout(null, safeToolId),
    state: tool?.createInitialState?.() || {}
  };
}

function cloneSceneState(sceneState, { getStudents } = {}){
  return {
    version: SCENE_VERSION,
    background: String(sceneState?.background || "space"),
    selectedWidgetId: String(sceneState?.selectedWidgetId || ""),
    widgets: (Array.isArray(sceneState?.widgets) ? sceneState.widgets : []).map((widget, index) => {
      const tool = getTeacherTool(widget?.toolId);
      const rawState = widget?.state && typeof widget.state === "object" ? { ...widget.state } : {};
      const projectorState = tool?.createProjectorState?.({
        state: rawState,
        students: getStudents?.() || []
      }) || rawState;

      return {
        ...widget,
        zIndex: normalizeWidgetZIndex(widget, index),
        layout: normalizeLayout(widget?.layout, widget?.toolId),
        state: projectorState
      };
    })
  };
}

export function createTeacherToolsViewController({
  view,
  host,
  getCurrentTeacherSpace,
  getCurrentStudents,
  showToast
} = {}){
  const tools = listTeacherTools();
  const firstWidget = createWidget(tools[0]?.id || "random-student");
  let sceneState = {
    version: SCENE_VERSION,
    background: "space",
    selectedWidgetId: firstWidget.id,
    widgets: [firstWidget]
  };
  let channelId = createTeacherToolsChannelId();
  let channel = null;
  let channelTeacherSpaceId = "";
  let projectorWindow = null;
  let activeControlSession = null;
  let widgetPickerOverlay = null;
  let projectorStatus = {
    connected: false,
    lastSeenAt: 0
  };

  function getTeacherSpaceId(){
    return String(getCurrentTeacherSpace?.()?.id || "").trim();
  }

  function getSelectedWidget(){
    const selectedWidgetId = String(sceneState.selectedWidgetId || "").trim();
    if (!selectedWidgetId) return null;
    return sceneState.widgets.find((widget) => widget.id === selectedWidgetId) || null;
  }

  function ensureSelection(){
    if (!String(sceneState.selectedWidgetId || "").trim()) return;
    if (getSelectedWidget()) return;
    sceneState.selectedWidgetId = sceneState.widgets[0]?.id || "";
  }

  function ensureChannel(){
    const teacherSpaceId = getTeacherSpaceId();
    if (!teacherSpaceId) return null;

    if (channel && channelTeacherSpaceId === teacherSpaceId) return channel;

    channel?.close?.();
    channelTeacherSpaceId = teacherSpaceId;
    channelId = createTeacherToolsChannelId();
    channel = createTeacherToolsChannel({
      teacherSpaceId,
      channelId,
      onMessage: (message) => {
        if (message?.type === "projector-ready") {
          projectorStatus = {
            connected: true,
            lastSeenAt: Date.now()
          };
          renderProjectorStatusOnly();
          syncProjector();
          return;
        }
        if (message?.type === "projector-closed") {
          projectorStatus = {
            connected: false,
            lastSeenAt: Date.now()
          };
          renderProjectorStatusOnly();
          return;
        }
        if (message?.type === "request-status") {
          syncProjector();
          return;
        }
        if (message?.type === "projector-widget-layout" || message?.type === "widget-layout") {
          applyWidgetLayoutFromProjector(message.widgetId, message.layout);
          return;
        }
        if (message?.type === "widget-action") {
          applyWidgetActionFromProjector(message.widgetId, message.action, message.payload);
          return;
        }
        if (message?.type === "select-widget") {
          selectWidget(message.widgetId, { sync: false });
        }
      }
    });

    return channel;
  }

  function sendToProjector(type, payload = {}){
    const safeChannel = ensureChannel();
    if (!safeChannel) return false;
    safeChannel.send(type, payload);
    return true;
  }

  function syncProjector(){
    sendToProjector("scene-state", {
      scene: cloneSceneState(sceneState, { getStudents: () => getCurrentStudents?.() || [] })
    });
  }

  function openProjector(){
    const teacherSpaceId = getTeacherSpaceId();
    const safeChannel = ensureChannel();

    if (!teacherSpaceId) {
      showToast?.("Crée d’abord ton espace enseignant.", { isError: true });
      return null;
    }

    if (!safeChannel) {
      showToast?.("Le navigateur ne permet pas d’ouvrir le canal de projection.", { isError: true });
      return null;
    }

    const popupUrl = buildTeacherToolsProjectorUrl({
      teacherSpaceId,
      channelId
    });
    const popupFeatures = [
      "popup=yes",
      "width=1400",
      "height=900",
      "menubar=no",
      "toolbar=no",
      "location=no",
      "status=no",
      "resizable=yes",
      "scrollbars=no"
    ].join(",");

    projectorWindow = window.open(popupUrl, "teacherToolsProjector", popupFeatures);

    if (!projectorWindow) {
      showToast?.("La fenêtre de projection a été bloquée par le navigateur.", { isError: true });
      return null;
    }

    try {
      projectorWindow.focus();
    } catch {}

    window.setTimeout(syncProjector, 180);
    return projectorWindow;
  }

  function getWidgetById(widgetId){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return null;
    return sceneState.widgets.find((widget) => widget.id === safeWidgetId) || null;
  }

  function updateWidget(widgetId, patch = {}, { renderPanel = true, sync = true } = {}){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return;

    let didUpdate = false;
    sceneState = {
      ...sceneState,
      widgets: sceneState.widgets.map((widget, index) => {
        if (widget.id !== safeWidgetId) return widget;
        didUpdate = true;
        const nextToolId = patch.toolId || widget.toolId;
        return {
          ...widget,
          ...patch,
          zIndex: Math.max(1, Math.trunc(Number(patch.zIndex ?? widget.zIndex) || index + 1)),
          layout: normalizeLayout(patch.layout || widget.layout, nextToolId),
          state: patch.state && typeof patch.state === "object" ? patch.state : widget.state
        };
      })
    };

    if (!didUpdate) return;
    ensureSelection();
    if (renderPanel) render();
    if (sync) syncProjector();
  }

  function applyWidgetLayoutFromProjector(widgetId, layout){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return;

    sceneState = {
      ...sceneState,
      widgets: sceneState.widgets.map((widget) => {
        if (widget.id !== safeWidgetId) return widget;
        return {
          ...widget,
          layout: normalizeLayout(layout, widget.toolId)
        };
      })
    };

    renderWidgetListOnly();
  }

  function applyWidgetActionFromProjector(widgetId, action, payload = {}){
    const widget = getWidgetById(widgetId);
    if (!widget) return;

    const tool = getTeacherTool(widget.toolId);
    if (typeof tool?.applyAction !== "function") return;

    const result = tool.applyAction({
      action: String(action || "").trim(),
      payload: payload && typeof payload === "object" ? payload : {},
      state: widget.state,
      widget,
      students: getCurrentStudents?.() || []
    });

    if (!result || typeof result !== "object") return;

    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return;
    }

    const patch = result.patch && typeof result.patch === "object" ? result.patch : null;
    if (patch) {
      sceneState = {
        ...sceneState,
        selectedWidgetId: widget.id
      };
      updateWidget(widget.id, patch, { renderPanel: true, sync: true });
    }

    if (result.message) {
      showToast?.(String(result.message), { isError: result.isError === true });
    }
  }

  function setBackground(background){
    const safeBackground = SCENE_BACKGROUNDS.some((item) => item.id === background) ? background : "space";
    sceneState = {
      ...sceneState,
      background: safeBackground
    };
    syncProjector();
  }

  function selectWidget(widgetId, { sync = true } = {}){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) {
      const hadSelection = Boolean(sceneState.selectedWidgetId);
      sceneState = {
        ...sceneState,
        selectedWidgetId: ""
      };
      render();
      if (sync && hadSelection) syncProjector();
      return;
    }

    if (!sceneState.widgets.some((widget) => widget.id === safeWidgetId)) return;
    sceneState = {
      ...sceneState,
      selectedWidgetId: safeWidgetId
    };
    render();
    if (sync) syncProjector();
  }

  function resetSceneLayout(){
    sceneState = {
      ...sceneState,
      widgets: sceneState.widgets.map((widget) => ({
        ...widget,
        visible: true,
        layout: normalizeLayout(null, widget.toolId)
      }))
    };
    render();
    syncProjector();
    showToast?.("Disposition de projection réinitialisée.");
  }

  function centerSelectedWidget(){
    const widget = getSelectedWidget();
    if (!widget) return;
    const layout = normalizeLayout(widget.layout, widget.toolId);
    updateWidget(widget.id, {
      visible: true,
      layout: {
        ...layout,
        x: Math.max(0, (1 - layout.width) / 2),
        y: Math.max(0, (1 - layout.height) / 2)
      }
    });
  }

  function duplicateSelectedWidget(){
    const widget = getSelectedWidget();
    if (!widget) return;

    const clone = {
      ...widget,
      id: createWidgetId(widget.toolId),
      label: `${widget.label || "Widget"} copie`,
      zIndex: getNextWidgetZIndex(sceneState.widgets),
      layout: normalizeLayout({
        ...widget.layout,
        x: Math.min(0.96 - Number(widget.layout?.width || 0.34), Number(widget.layout?.x || 0) + 0.04),
        y: Math.min(0.90 - Number(widget.layout?.height || 0.24), Number(widget.layout?.y || 0) + 0.04)
      }, widget.toolId),
      state: widget.state && typeof widget.state === "object" ? { ...widget.state } : {}
    };

    sceneState = {
      ...sceneState,
      selectedWidgetId: clone.id,
      widgets: [...sceneState.widgets, clone]
    };
    render();
    syncProjector();
  }

  function bringSelectedWidgetToFront(){
    const widget = getSelectedWidget();
    if (!widget) return;
    updateWidget(widget.id, {
      zIndex: getNextWidgetZIndex(sceneState.widgets)
    });
  }

  function removeWidget(widgetId){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return;
    if (!sceneState.widgets.some((widget) => widget.id === safeWidgetId)) return;

    sceneState = {
      ...sceneState,
      widgets: sceneState.widgets.filter((widget) => widget.id !== safeWidgetId)
    };
    ensureSelection();
    render();
    syncProjector();
  }

  function removeSelectedWidget(){
    const widget = getSelectedWidget();
    if (!widget) return;
    removeWidget(widget.id);
  }

  function renderAddWidgetButton(){
    return `
      <button
        id="ttOpenWidgetPicker"
        class="tt-add-widget-btn"
        type="button"
        aria-haspopup="dialog"
      >
        <span class="dashboard-material-icon" aria-hidden="true">add</span>
        <span>Ajouter widget</span>
      </button>
    `;
  }

  function renderWidgetPickerItems(){
    if (!tools.length) {
      return `<div class="tt-widget-picker-empty">Aucun widget disponible.</div>`;
    }

    return tools.map((tool) => `
      <button class="tt-widget-picker-option" type="button" data-teacher-tool-pick="${escapeAttr(tool.id)}">
        <span class="dashboard-material-icon tt-widget-picker-icon" aria-hidden="true">${escapeHtml(tool.icon || "widgets")}</span>
        <span class="tt-widget-picker-copy">
          <strong>${escapeHtml(tool.label || "Widget")}</strong>
          <small>${escapeHtml(tool.description || "Widget de tableau interactif.")}</small>
        </span>
      </button>
    `).join("");
  }

  function closeWidgetPickerOverlay({ restoreFocusTo = null } = {}){
    const overlay = widgetPickerOverlay;
    widgetPickerOverlay = null;
    overlay?.remove?.();

    if (restoreFocusTo?.isConnected) {
      restoreFocusTo.focus?.();
    }
  }

  function openWidgetPickerOverlay(){
    if (widgetPickerOverlay?.isConnected) {
      widgetPickerOverlay.querySelector("[data-teacher-tool-pick], [data-widget-picker-close]")?.focus?.();
      return;
    }

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = document.createElement("div");
    overlay.className = "modal tt-widget-picker-modal";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <div class="modal-content modal-content-wide tt-widget-picker-card" role="dialog" aria-modal="true" aria-labelledby="ttWidgetPickerTitle">
        <div class="tt-widget-picker-head">
          <div id="ttWidgetPickerTitle" class="modal-title">Ajouter un widget</div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn tt-widget-picker-close" type="button" data-widget-picker-close aria-label="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>

        <div class="tt-widget-picker-grid">
          ${renderWidgetPickerItems()}
        </div>
      </div>
    `;

    widgetPickerOverlay = overlay;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      const target = event.target;
      if (target === overlay || target?.closest?.("[data-widget-picker-close]")) {
        closeWidgetPickerOverlay({ restoreFocusTo: opener });
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWidgetPickerOverlay({ restoreFocusTo: opener });
      }
    });

    overlay.querySelectorAll("[data-teacher-tool-pick]").forEach((button) => {
      button.addEventListener("click", () => {
        const toolId = button.dataset.teacherToolPick;
        closeWidgetPickerOverlay();
        addWidget(toolId);
      });
    });

    overlay.querySelector("[data-teacher-tool-pick], [data-widget-picker-close]")?.focus?.();
  }

  function renderBackgroundSelect(){
    return renderSelectControl({
      id: "ttSceneBackground",
      value: sceneState.background,
      options: SCENE_BACKGROUNDS.map((background) => ({
        value: background.id,
        label: background.label
      })),
      rootClassName: "tt-background-select"
    });
  }

  function renderWidgetList(){
    if (!sceneState.widgets.length) {
      return `<div class="tt-widget-empty">Aucun widget actif.</div>`;
    }

    return sceneState.widgets.map((widget) => {
      const tool = getTeacherTool(widget.toolId);
      const isSelected = widget.id === sceneState.selectedWidgetId;
      return `
        <div class="tt-widget-row${isSelected ? " is-selected" : ""}" data-widget-row="${escapeAttr(widget.id)}">
          <button class="tt-widget-select" type="button" data-widget-select="${escapeAttr(widget.id)}">
            <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(widget.icon || tool?.icon || "widgets")}</span>
            <span class="tt-widget-row-main">
              <strong>${escapeHtml(widget.label || tool?.label || "Widget")}</strong>
            </span>
          </button>
          <button class="tt-widget-row-icon-btn" type="button" data-widget-remove="${escapeAttr(widget.id)}" title="Retirer ce widget" aria-label="Retirer ce widget">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
          <label class="tt-widget-toggle" title="Afficher ou masquer dans la projection">
            <input type="checkbox" data-widget-visible="${escapeAttr(widget.id)}" ${widget.visible ? "checked" : ""}>
            <span aria-hidden="true"></span>
          </label>
        </div>
      `;
    }).join("");
  }

  function renderWidgetListOnly(){
    const listHost = host?.querySelector("[data-widget-list]");
    if (!listHost) return;
    listHost.innerHTML = renderWidgetList();
    bindWidgetListEvents(listHost);
  }

  function bindWidgetListEvents(root = host){
    root?.querySelectorAll("[data-widget-select]").forEach((button) => {
      button.addEventListener("click", () => {
        selectWidget(button.dataset.widgetSelect);
      });
    });

    root?.querySelectorAll("[data-widget-visible]").forEach((input) => {
      input.addEventListener("change", () => {
        updateWidget(input.dataset.widgetVisible, { visible: input.checked === true });
      });
    });

    root?.querySelectorAll("[data-widget-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        removeWidget(button.dataset.widgetRemove);
      });
    });
  }

  function addWidget(toolId){
    const tool = getTeacherTool(toolId);
    if (!tool) return;

    const widget = createWidget(tool.id, { widgets: sceneState.widgets });
    sceneState = {
      ...sceneState,
      selectedWidgetId: widget.id,
      widgets: [...sceneState.widgets, widget]
    };
    render();
    syncProjector();
  }

  function renderActiveControlPanel(){
    const panelHost = host?.querySelector("[data-teacher-tool-panel]");
    if (!panelHost) return;

    activeControlSession?.destroy?.();
    activeControlSession = null;

    ensureSelection();
    const selectedWidget = getSelectedWidget();
    if (!selectedWidget) {
      panelHost.innerHTML = `<div class="dashboard-activity-empty-state">Sélectionne ou ajoute un widget.</div>`;
      return;
    }

    const tool = getTeacherTool(selectedWidget.toolId);
    if (!tool) {
      panelHost.innerHTML = `<div class="dashboard-activity-empty-state is-error">Widget introuvable.</div>`;
      return;
    }

    panelHost.innerHTML = `
      <div class="tt-selected-widget-shell">
        <section class="tt-widget-control-section" data-teacher-tool-control-slot aria-label="Contrôles du widget sélectionné"></section>
      </div>
    `;

    const toolPanelHost = panelHost.querySelector("[data-teacher-tool-control-slot]") || panelHost;

    activeControlSession = tool.createControlPanel?.({
      host: toolPanelHost,
      getWidget: () => getSelectedWidget(),
      updateWidget: (patch = {}, options = {}) => updateWidget(selectedWidget.id, patch, options),
      getStudents: () => getCurrentStudents?.() || [],
      sendToProjector,
      syncProjector,
      openProjector,
      showToast,
      sceneState: cloneSceneState(sceneState)
    }) || null;
  }

  function renderProjectorStatus(){
    const isConnected = projectorStatus.connected === true;
    return `
      <div class="tt-projector-status ${isConnected ? "is-connected" : ""}" data-projector-status>
        <span class="dashboard-material-icon" aria-hidden="true">${isConnected ? "cast_connected" : "cast"}</span>
        <span>${isConnected ? "Projection connectée" : "Projection non connectée"}</span>
      </div>
    `;
  }

  function renderProjectorStatusOnly(){
    const node = host?.querySelector("[data-projector-status]");
    if (!node) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderProjectorStatus().trim();
    node.replaceWith(wrapper.firstElementChild);
  }

  function render(){
    if (!host) return;
    ensureSelection();

    host.innerHTML = `
      <div class="dashboard-config-header tt-header">
        <div class="dashboard-config-header-main tt-header-main">
          <div class="dashboard-section-title">Tableau interactif</div>
        </div>

        <div class="dashboard-config-header-center tt-header-center">
          ${renderProjectorStatus()}
        </div>

        <div class="dashboard-config-header-actions">
          <button id="btnTeacherToolsOpenProjector" class="btn primary" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">open_in_new</span>
            <span>Ouvrir la projection</span>
          </button>
        </div>
      </div>

      <div class="dashboard-content-scroll dashboard-explorer-host tt-view-scroll">
        <div class="dashboard-activities-explorer tt-board-explorer">
          <section class="dashboard-activity-tree-pane panel tt-board-pane tt-board-scene-pane" aria-label="Widgets de la scène">
            ${renderAddWidgetButton()}

            <div class="tt-board-pane-scroll">
              <div class="tt-widget-list tt-widget-list-board" data-widget-list>
                ${renderWidgetList()}
              </div>
            </div>
          </section>

          <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical" aria-label="Séparateur entre les panneaux"></div>

          <section class="dashboard-activity-tiles-pane panel tt-board-pane tt-board-control-pane" aria-label="Contrôle des widgets">
            <div class="tt-board-pane-header">
              <div class="tt-board-pane-title">
                <span class="dashboard-material-icon" aria-hidden="true">tune</span>
                <span>Contrôles</span>
              </div>
              <div class="tt-board-header-right">
                <div class="tt-board-background-field">
                  <span>Fond</span>
                  ${renderBackgroundSelect()}
                </div>
                <div class="tt-board-actions">
                  <button id="ttResetSceneLayout" class="dashboard-icon-btn dashboard-material-icon-btn" type="button" title="Réinitialiser la scène" aria-label="Réinitialiser la scène">
                    <span class="dashboard-material-icon" aria-hidden="true">restart_alt</span>
                  </button>
                  <button id="ttCenterWidget" class="dashboard-icon-btn dashboard-material-icon-btn" type="button" title="Centrer le widget" aria-label="Centrer le widget">
                    <span class="dashboard-material-icon" aria-hidden="true">filter_center_focus</span>
                  </button>
                  <button id="ttDuplicateWidget" class="dashboard-icon-btn dashboard-material-icon-btn" type="button" title="Dupliquer le widget" aria-label="Dupliquer le widget" ${getSelectedWidget() ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">content_copy</span>
                  </button>
                  <button id="ttBringWidgetFront" class="dashboard-icon-btn dashboard-material-icon-btn" type="button" title="Mettre le widget devant" aria-label="Mettre le widget devant" ${getSelectedWidget() ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">flip_to_front</span>
                  </button>
                  <button id="ttRemoveWidget" class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" title="Retirer le widget" aria-label="Retirer le widget" ${getSelectedWidget() ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">delete</span>
                  </button>
                </div>
              </div>
            </div>

            <main class="tt-tool-panel-host tt-board-pane-scroll" data-teacher-tool-panel>
              <div class="dashboard-activity-empty-state">Chargement du widget…</div>
            </main>
          </section>
        </div>
      </div>
    `;

    host.querySelector("#btnTeacherToolsOpenProjector")?.addEventListener("click", openProjector);
    host.querySelector("#ttOpenWidgetPicker")?.addEventListener("click", openWidgetPickerOverlay);
    bindSelect(host, "ttSceneBackground", {
      onChange: (value) => {
        setBackground(value);
      }
    });
    host.querySelector("#ttResetSceneLayout")?.addEventListener("click", resetSceneLayout);
    host.querySelector("#ttCenterWidget")?.addEventListener("click", centerSelectedWidget);
    host.querySelector("#ttDuplicateWidget")?.addEventListener("click", duplicateSelectedWidget);
    host.querySelector("#ttBringWidgetFront")?.addEventListener("click", bringSelectedWidgetToFront);
    host.querySelector("#ttRemoveWidget")?.addEventListener("click", removeSelectedWidget);

    bindWidgetListEvents(host);
    renderActiveControlPanel();
  }

  return {
    render,
    refresh(){
      activeControlSession?.render?.();
      syncProjector();
    },
    destroy(){
      activeControlSession?.destroy?.();
      activeControlSession = null;
      closeWidgetPickerOverlay();
      channel?.close?.();
      channel = null;
      if (view) view.innerHTML = "";
    }
  };
}
