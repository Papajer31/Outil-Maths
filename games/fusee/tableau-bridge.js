// The standalone game keeps its popup/channel; embedded screens use their
// Tableau parent and never open a second projection window.
export function createTableauBridge(){
  const params = new URLSearchParams(location.search);
  const mode = params.get("tableau");
  if (!["control", "runtime"].includes(mode) || window.parent === window) return null;
  const pageId = params.get("page") || "";
  return {
    mode,
    post(type, payload = {}){
      window.parent.postMessage({ source:"fusee-tableau", pageId, type, ...payload }, location.origin);
    },
    listen(onMessage){
      window.addEventListener("message", (event) => {
        if (event.origin !== location.origin || event.source !== window.parent) return;
        if (event.data?.source !== "tableau-fusee" || event.data.pageId !== pageId) return;
        onMessage(event.data);
      });
    }
  };
}
