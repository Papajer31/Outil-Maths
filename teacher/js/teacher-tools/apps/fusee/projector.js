import { createFuseeFrame } from "./frame.js";
import { normalizeFuseeState } from "./model.js";
import { createSurfaceBackgroundProjector } from "../../surface/background-projector.js";

const sessions = new Map();
const waitingScreens = new Map();
const waitingRocketUrl = new URL("../../../../../shared/ui-assets/rocket-on.svg", import.meta.url).href;

function clearWaitingScreen(pageId){
  const screen = waitingScreens.get(pageId);
  if (!screen) return;
  screen.background.destroy();
  screen.root.remove();
  waitingScreens.delete(pageId);
}

function renderWaitingScreen(host, pageId){
  if (waitingScreens.get(pageId)?.root.parentElement === host) return;
  clearWaitingScreen(pageId);
  const root = document.createElement("div");
  root.className = "ttp-stage ttp-fusee-waiting";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", "La Fusée en vol, mission en préparation");
  root.innerHTML = `<div class="ttp-space-starfield" aria-hidden="true"></div><div class="ttp-fusee-waiting-flight" aria-hidden="true"><img class="ttp-fusee-waiting-rocket" src="${waitingRocketUrl}" alt="" draggable="false"></div>`;
  host.replaceChildren(root);
  const background = createSurfaceBackgroundProjector({ stage:root, starfieldHost:root.querySelector(".ttp-space-starfield") });
  background.render({ backgroundMode:"preset", background:"space" });
  waitingScreens.set(pageId, { root, background });
}

function syncSession(session){
  if (!session.ready) return;
  session.bridge.send("initialize", {
    saved:session.state.saved, launchId:session.state.launchId,
    active:session.active, chromeVisible:session.chromeVisible
  });
  session.bridge.send("settings", { settings:session.state.config });
}

export function renderFuseeProjector({ host, chromeHost, state, page, sendAction, chromeVisible = true, requestFullscreen, closeAppControls } = {}){
  if (!host || !page?.id) return;
  const safeState = normalizeFuseeState(state);
  let session = sessions.get(page.id);
  if (!safeState.launchId || !safeState.saved) {
    if (session) disposeFuseeProjector({ pageId:page.id });
    renderWaitingScreen(host, page.id);
    return;
  }
  clearWaitingScreen(page.id);
  host.replaceChildren();
  if (!session) {
    const root = document.createElement("div");
    root.className = "ttp-fusee-runtime";
    session = { root, ready:false, active:true };
    session.bridge = createFuseeFrame({ mode:"runtime", pageId:page.id, onMessage(message){
      if (message.type === "ready") { session.ready = true; syncSession(session); }
      else if (message.type === "state") {
        if (message.launchId !== session.state.launchId) return;
        session.state.saved = message.saved;
        session.page.state = { ...session.page.state, saved:message.saved };
        session.sendAction?.("runtime:save", { saved:message.saved, launchId:message.launchId });
      } else if (message.type === "stopped") {
        if (message.launchId !== session.state.launchId) return;
        session.page.state = { ...session.page.state, launchId:"" };
        session.sendAction?.("runtime:stop", { launchId:message.launchId });
      } else if (message.type === "settings") {
        session.sendAction?.("runtime:settings", { settings:message.settings, launchId:message.launchId });
      } else if (message.type === "fullscreen") session.requestFullscreen?.();
    } });
    root.append(session.bridge.frame);
    // Keep the iframe attached when another mini-app replaces appHost's content:
    // removing or moving it would destroy the game's browsing context.
    host.parentElement.append(root);
    sessions.set(page.id, session);
  }
  Object.assign(session, { state:safeState, page, sendAction, requestFullscreen, chromeVisible, active:true });
  session.root.hidden = false;
  if (chromeHost) {
    chromeHost.innerHTML = `<button type="button" class="ttp-widget-action-btn" data-fusee-pause>Pause et options</button><button type="button" class="ttp-widget-action-btn" data-fusee-export>Sauvegarder la partie</button>`;
    chromeHost.querySelector("[data-fusee-pause]").addEventListener("click", () => {
      closeAppControls?.();
      session.bridge.send("pause");
    });
    chromeHost.querySelector("[data-fusee-export]").addEventListener("click", () => session.bridge.send("export"));
  }
  syncSession(session);
}

export function pauseFuseeProjector({ page, pageId } = {}){
  const id = pageId || page?.id;
  clearWaitingScreen(id);
  const session = sessions.get(id);
  if (!session) return;
  session.active = false;
  // The same-origin call captures the checkpoint before the page disappears.
  try {
    const api = session.bridge.frame.contentWindow.FuseeApp;
    api?.setTableauActive(false);
    const saved = api?.getSavedGame();
    if (saved) {
      session.page.state = { ...session.page.state, saved };
      session.sendAction?.("runtime:save", { saved, launchId:session.state.launchId });
    }
  } catch {}
  session.bridge.send("active", { active:false });
  session.root.hidden = true;
}

export function setFuseeProjectorChromeVisibility({ page, pageId, visible } = {}){
  const session = sessions.get(pageId || page?.id);
  if (!session) return;
  session.chromeVisible = visible !== false;
  session.bridge.send("chrome", { visible:session.chromeVisible });
}

export function disposeFuseeProjector({ page, pageId } = {}){
  const id = pageId || page?.id;
  clearWaitingScreen(id);
  const session = sessions.get(id);
  if (!session) return;
  pauseFuseeProjector({ pageId:id });
  session.bridge.destroy();
  session.root.remove();
  sessions.delete(id);
}

window.addEventListener("beforeunload", () => {
  for (const pageId of new Set([...sessions.keys(), ...waitingScreens.keys()])) disposeFuseeProjector({ pageId });
});
