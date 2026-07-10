export function isDevViewportMode(){
  try {
    const search = new URLSearchParams(window.location.search || "");
    if (search.get("devViewport") === "1") return true;

    const hash = String(window.location.hash || "");
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    if (query) {
      const hashParams = new URLSearchParams(query);
      if (hashParams.get("devViewport") === "1") return true;
    }
  } catch {}
  return false;
}

export function requestAppFullscreen(){
  if (isDevViewportMode()) return Promise.resolve(false);

  try {
    if (document.fullscreenElement){
      return Promise.resolve(true);
    }

    const result = document.documentElement.requestFullscreen?.();
    if (result?.then){
      return result.then(() => true).catch(() => false);
    }
  } catch {
    return Promise.resolve(false);
  }

  return Promise.resolve(false);
}

export function escapeHtml(value){
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeAttr(value){
  return escapeHtml(value);
}
