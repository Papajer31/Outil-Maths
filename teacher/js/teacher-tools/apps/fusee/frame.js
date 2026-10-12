export function createFuseeFrame({ mode, pageId, onMessage } = {}){
  const frame = document.createElement("iframe");
  frame.className = mode === "control" ? "tt-fusee-control-frame" : "ttp-fusee-runtime-frame";
  frame.title = mode === "control" ? "Préparation de La Fusée" : "Jeu La Fusée";
  frame.allow = "autoplay; fullscreen";
  const url = new URL("../../../../../games/fusee/", import.meta.url);
  url.searchParams.set("tableau", mode);
  url.searchParams.set("page", pageId);
  if (mode === "runtime") url.searchParams.set("runtime", "1");
  frame.src = url.href;
  const abort = new AbortController();
  window.addEventListener("message", (event) => {
    if (event.origin !== url.origin || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (message?.source !== "fusee-tableau" || message.pageId !== pageId) return;
    onMessage?.(message);
  }, { signal:abort.signal });
  return {
    frame,
    send(type, payload = {}){
      frame.contentWindow?.postMessage({ source:"tableau-fusee", pageId, type, ...payload }, url.origin);
    },
    destroy(){ abort.abort(); frame.remove(); }
  };
}
