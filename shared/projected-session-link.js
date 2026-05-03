function normalizeLinkAccessCode(value){
  return String(value || "").trim().toUpperCase();
}

function normalizeLinkConfigName(value){
  return String(value || "").trim();
}

function buildChannelName(accessCode, configName){
  const safeAccessCode = encodeURIComponent(normalizeLinkAccessCode(accessCode));
  const safeConfigName = encodeURIComponent(normalizeLinkConfigName(configName).toLowerCase());
  return `projected-session::${safeAccessCode}::${safeConfigName}`;
}

function buildSourceId(){
  try {
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}

  return `ps-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function createProjectedSessionLink({ accessCode, configName, onMessage } = {}){
  const safeAccessCode = normalizeLinkAccessCode(accessCode);
  const safeConfigName = normalizeLinkConfigName(configName);

  if (!safeAccessCode || !safeConfigName) return null;
  if (typeof BroadcastChannel !== "function") return null;

  const channelName = buildChannelName(safeAccessCode, safeConfigName);
  const sourceId = buildSourceId();
  const channel = new BroadcastChannel(channelName);

  channel.addEventListener("message", (event) => {
    const message = event?.data;
    if (!message || typeof message !== "object") return;
    if (message.sourceId === sourceId) return;
    onMessage?.(message);
  });

  return {
    channelName,
    sourceId,
    send(type, payload = {}){
      const safeType = String(type || "").trim();
      if (!safeType) return;

      channel.postMessage({
        type: safeType,
        sourceId,
        sentAt: Date.now(),
        ...payload
      });
    },
    close(){
      channel.close();
    }
  };
}
