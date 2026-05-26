function normalizePart(value){
  return String(value || "").trim();
}

export function createTeacherToolsChannelId(){
  try {
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}

  return `tt-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function buildTeacherToolsChannelName({ teacherSpaceId, channelId } = {}){
  const safeTeacherSpaceId = encodeURIComponent(normalizePart(teacherSpaceId));
  const safeChannelId = encodeURIComponent(normalizePart(channelId));

  if (!safeTeacherSpaceId || !safeChannelId) return "";
  return `teacher-tools::${safeTeacherSpaceId}::${safeChannelId}`;
}

export function createTeacherToolsChannel({ teacherSpaceId, channelId, onMessage } = {}){
  if (typeof BroadcastChannel !== "function") return null;

  const channelName = buildTeacherToolsChannelName({ teacherSpaceId, channelId });
  if (!channelName) return null;

  const sourceId = createTeacherToolsChannelId();
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
      const safeType = normalizePart(type);
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

export function buildTeacherToolsProjectorUrl({ teacherSpaceId, channelId } = {}){
  const params = new URLSearchParams();
  params.set("space", normalizePart(teacherSpaceId));
  params.set("channel", normalizePart(channelId));

  return `./teacher-tools-projector.html?${params.toString()}`;
}
