import { createFuseeFrame } from "./frame.js";
import { normalizeFuseeState } from "./model.js";

export function createFuseeControlPanel({ host, getWidget, updateWidget, openProjector } = {}){
  const pageId = getWidget()?.id;
  let ready = false;
  const bridge = createFuseeFrame({ mode:"control", pageId, onMessage(message){
    const state = normalizeFuseeState(getWidget()?.state);
    if (message.type === "ready") {
      ready = true;
      bridge.send("initialize", { state });
    } else if (message.type === "initialized") {
      updateWidget({ state:{ ...state, initialized:true, config:message.config, saved:message.saved } }, { renderPanel:false });
    } else if (message.type === "config") {
      updateWidget({ state:{ ...state, config:message.config } }, { renderPanel:false });
    } else if (message.type === "saved") {
      updateWidget({ state:{ ...state, saved:message.saved, launchId:"" } }, { renderPanel:false });
    } else if (message.type === "launch") {
      const launchId = message.resume && state.launchId
        ? state.launchId : crypto.randomUUID();
      updateWidget({ state:{ ...state, saved:message.saved, launchId } }, { renderPanel:false });
      openProjector?.();
    }
  } });
  host.classList.add("tt-fusee-control-host");
  host.replaceChildren(bridge.frame);
  return {
    update(page){
      if (ready) {
        bridge.send("saved", { saved:page.state?.saved, running:!!page.state?.launchId });
        bridge.send("settings", { settings:page.state?.config });
      }
    },
    destroy(){ host.classList.remove("tt-fusee-control-host"); bridge.destroy(); }
  };
}
