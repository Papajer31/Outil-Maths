const TEST_WINDOW_NAME = "odapp_catalog_test_projection";
const TEST_WINDOW_FEATURES = "popup=yes,width=1280,height=800,resizable=yes,scrollbars=no";
const TEST_WINDOW_URL = new URL("../../catalog-test-window.html", import.meta.url).href;

let activeSession = null;

/**
 * Ouvre le lecteur de test/projection dans une vraie fenêtre secondaire.
 *
 * Le contenu (activité enregistrée ou brouillon, quiz compris) est transmis par
 * postMessage afin de conserver les réglages non enregistrés de « Tester ainsi ».
 */
export function openCatalogTestRunner(options = {}) {
  return openTestProjectionRunner({ ...options, runnerKind: "activity" });
}

export function openMissionProjectionRunner(options = {}) {
  return openTestProjectionRunner({ ...options, runnerKind: "mission" });
}

function openTestProjectionRunner(options = {}) {
  const payload = buildSerializablePayload(options);
  const isMission = payload?.kind === "mission";
  const hasSource = isMission
    ? Boolean(payload?.mission?.id && Array.isArray(payload?.missionSteps) && payload.missionSteps.length)
    : Boolean(payload?.activity?.id);
  if (!hasSource || !payload.accessCode) {
    options.showToast?.(
      isMission ? "Impossible d’ouvrir la projection de cette mission." : "Impossible d’ouvrir le test de cette activité.",
      { isError: true }
    );
    return null;
  }

  // Une seule fenêtre de test/projection est utile à la fois. Si un ancien
  // contrôleur existe encore (par exemple un test de quiz lancé depuis l’atelier),
  // on libère sa session sans fermer la fenêtre : window.open la réutilisera.
  if (activeSession) {
    finalizeSession(activeSession, { closeWindow: false, notifyClose: true });
  }

  let popup = null;
  try {
    popup = window.open(TEST_WINDOW_URL, TEST_WINDOW_NAME, TEST_WINDOW_FEATURES);
  } catch {}

  if (!popup) {
    options.showToast?.(
      "Le navigateur a bloqué la fenêtre de test. Autorise les fenêtres pop-up pour ce site.",
      { isError: true }
    );
    return null;
  }

  const token = createToken();
  const session = {
    token,
    popup,
    payload,
    onClose: typeof options.onClose === "function" ? options.onClose : null,
    messageHandler: null,
    closedPoll: null,
    sendTimers: [],
    finalized: false
  };
  activeSession = session;

  const sendPayload = () => {
    if (session.finalized || popup.closed) return;
    try {
      popup.postMessage({
        type: "odapp:catalog-test:load",
        token,
        payload
      }, window.location.origin);
    } catch {}
  };

  session.messageHandler = (event) => {
    if (event.source !== popup || event.origin !== window.location.origin) return;
    const message = event.data && typeof event.data === "object" ? event.data : null;
    if (!message) return;

    if (message.type === "odapp:catalog-test:ready") {
      sendPayload();
      return;
    }

    if (message.type === "odapp:catalog-test:closed" && String(message.token || "") === token) {
      finalizeSession(session, { closeWindow: false, notifyClose: true });
    }
  };
  window.addEventListener("message", session.messageHandler);

  // L’envoi immédiat couvre une fenêtre déjà chargée ; les renvois courts
  // couvrent le temps de chargement d’une nouvelle fenêtre sans dépendre d’un
  // ordre particulier entre load et le message « ready ».
  sendPayload();
  [80, 250, 700].forEach((delay) => {
    const timer = window.setTimeout(sendPayload, delay);
    session.sendTimers.push(timer);
  });

  session.closedPoll = window.setInterval(() => {
    if (!popup.closed) return;
    finalizeSession(session, { closeWindow: false, notifyClose: true });
  }, 400);

  try {
    popup.focus();
  } catch {}

  return {
    close: () => finalizeSession(session, { closeWindow: true, notifyClose: true }),
    destroy: () => finalizeSession(session, { closeWindow: true, notifyClose: true }),
    focus: () => {
      try {
        if (!popup.closed) popup.focus();
      } catch {}
    }
  };
}

function finalizeSession(session, { closeWindow = false, notifyClose = false } = {}) {
  if (!session || session.finalized) return;
  session.finalized = true;

  if (session.messageHandler) {
    window.removeEventListener("message", session.messageHandler);
  }
  if (session.closedPoll) {
    window.clearInterval(session.closedPoll);
  }
  session.sendTimers?.forEach?.((timer) => window.clearTimeout(timer));
  session.sendTimers = [];

  if (closeWindow) {
    try {
      if (!session.popup?.closed) session.popup.close();
    } catch {}
  }

  if (activeSession === session) {
    activeSession = null;
  }

  if (notifyClose && session.onClose) {
    try {
      session.onClose();
    } catch {}
  }
}

function buildSerializablePayload(options) {
  const accessCode = String(options.accessCode || "").trim().toUpperCase();
  const kind = String(options.runnerKind || "activity").trim().toLowerCase() === "mission" ? "mission" : "activity";
  const activity = kind === "activity" ? cloneSerializable(options.activity) : null;
  const mission = kind === "mission" ? cloneSerializable(options.mission) : null;
  const missionSteps = kind === "mission"
    ? cloneSerializable(Array.isArray(options.missionSteps) ? options.missionSteps : [])
    : [];
  const catalogActivities = cloneSerializable(Array.isArray(options.catalogActivities) ? options.catalogActivities : []);
  const runtimeConfigOptions = cloneSerializable(
    options.runtimeConfigOptions && typeof options.runtimeConfigOptions === "object"
      ? options.runtimeConfigOptions
      : null
  );

  return {
    kind,
    accessCode,
    activity,
    mission,
    missionSteps,
    catalogActivities,
    initialLevel: normalizeLevel(options.initialLevel),
    titleLabel: String(
      options.titleLabel || (kind === "mission" ? "Projection de la mission" : "Test de l’activité")
    ).trim() || (kind === "mission" ? "Projection de la mission" : "Test de l’activité"),
    runtimeConfigOptions,
    showLevelSelector: kind === "mission" ? false : options.showLevelSelector !== false
  };
}

function cloneSerializable(value) {
  if (value == null) return value;

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {}
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeLevel(value) {
  const level = Math.trunc(Number(value));
  return Number.isFinite(level) ? Math.max(1, Math.min(5, level)) : 3;
}

function createToken() {
  if (globalThis.crypto?.randomUUID) {
    try {
      return globalThis.crypto.randomUUID();
    } catch {}
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
