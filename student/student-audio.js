import { studentState } from "./student-state.js";
import {
  listPublicInterfaceAudioAssets,
  getPublicInterfaceAudioAssetUrl
} from "./student-api.js";
import { getStaticInterfaceAudioRegistryEntries } from "../shared/interface-audio-registry.js";

let button = null;
let audioElement = null;
let welcomeOverlay = null;
let welcomeDismissed = false;
let welcomeLaunching = false;
const registryEntries = getStaticInterfaceAudioRegistryEntries();
let assetByKey = new Map();
let assetsAccessCode = null;
let assetsPromise = null;
let assetsLoaded = false;
let audioUnlocked = false;
let currentContext = null;
let lastAutoPlayedSignature = "";
let currentRouteName = "";
let activeToolId = "";
let awaitingFirstToolInstruction = false;

export function initializeStudentAudioEngine() {
  ensureAudioButton();
  installUnlockListeners();
  installToolListeners();
  void ensureAssetsForAccessCode(studentState.accessCode || "");
}

export function syncStudentAudioForRoute(routeName) {
  currentRouteName = String(routeName || "home").trim() || "home";
  syncWelcomeOverlayForRoute(currentRouteName);
  activeToolId = currentRouteName === "session" ? activeToolId : "";
  awaitingFirstToolInstruction = currentRouteName === "session" ? awaitingFirstToolInstruction : false;
  void ensureAssetsForAccessCode(studentState.accessCode || "");

  const context = resolveRouteAudioContext(currentRouteName);
  if (context) setStudentAudioContext(context);
  else setStudentAudioContext(null);
}

export async function playCurrentStudentAudio() {
  if (!currentContext?.text) return false;
  audioUnlocked = true;
  return await playResolvedContext(currentContext);
}

function resolveRouteAudioContext(routeName) {
  if (routeName === "home") {
    return { key:"student.home.class-code", text:"Écris le code de ta classe puis appuie sur Connexion.", autoPlay:false };
  }
  if (routeName === "selectmode") {
    return { key:"student.mode.choose", text:"Choisis si tu es tout seul ou si vous êtes plusieurs.", autoPlay:true };
  }
  if (routeName === "selectstudents") {
    const isGroup = String(studentState.activitiesMode || "").trim().toLowerCase() === "group";
    return isGroup
      ? { key:"student.students.choose-group", text:"Choisissez vos prénoms puis appuyez sur Valider.", autoPlay:true }
      : { key:"student.students.choose-one", text:"Choisis ton prénom.", autoPlay:true };
  }
  if (routeName === "activities") {
    const entry = String(studentState.activityEntry || "").trim().toLowerCase();
    if (entry === "exploration") {
      return { key:"student.exploration.choose", text:"Choisis ce que tu veux travailler.", autoPlay:true };
    }
    if (entry === "missions") {
      return { key:"student.missions.choose", text:"Choisis une mission.", autoPlay:true };
    }
    if (entry === "adventure") {
      return { key:"student.adventure.continue", text:"Continue ton aventure.", autoPlay:true };
    }
    const missions = Array.isArray(studentState.missions) ? studentState.missions : [];
    return missions.length
      ? { key:"student.hub.mission-available", text:"Tu as une mission à faire. Tu peux commencer par ta mission.", autoPlay:true }
      : { key:"student.hub.default", text:"Choisis ce que tu veux faire.", autoPlay:true };
  }
  if (routeName === "sessionstart") {
    return { key:"student.session.start", text:"Appuie sur la fusée pour commencer.", autoPlay:true };
  }
  if (routeName === "session") {
    return currentContext?.key?.startsWith("tool.") ? currentContext : null;
  }
  return null;
}

function setStudentAudioContext(context) {
  if (!context?.text) {
    currentContext = null;
    syncButtonState();
    return;
  }

  const next = {
    key: String(context.key || "").trim(),
    text: String(context.text || "").trim(),
    autoPlay: context.autoPlay === true
  };
  if (!next.text) return;

  const signature = `${next.key}::${next.text}`;
  const changed = signature !== `${currentContext?.key || ""}::${currentContext?.text || ""}`;
  currentContext = next;
  syncButtonState();

  if (changed && next.autoPlay && audioUnlocked && signature !== lastAutoPlayedSignature) {
    lastAutoPlayedSignature = signature;
    window.setTimeout(() => {
      if (`${currentContext?.key || ""}::${currentContext?.text || ""}` !== signature) return;
      void playResolvedContext(currentContext);
    }, 120);
  }
}

async function playResolvedContext(context) {
  stopCurrentPlayback();
  const recordedAsset = getMatchingRecordedAsset(context);

  if (recordedAsset) {
    const url = getPublicInterfaceAudioAssetUrl(recordedAsset);
    if (url) {
      try {
        audioElement = new Audio(url);
        audioElement.preload = "auto";
        audioElement.addEventListener("play", () => button?.classList.add("is-playing"));
        const clear = () => button?.classList.remove("is-playing");
        audioElement.addEventListener("pause", clear);
        audioElement.addEventListener("ended", clear);
        audioElement.addEventListener("error", clear);
        await audioElement.play();
        return true;
      } catch (error) {
        console.warn("Lecture de l’audio enregistré impossible, utilisation de la synthèse vocale.", error);
      }
    }
  }

  return speakWithBrowser(context.text);
}

function speakWithBrowser(text) {
  const speech = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;
  if (!speech || !Utterance) return false;
  try {
    speech.cancel();
    const utterance = new Utterance(String(text || "").trim());
    utterance.lang = "fr-FR";
    utterance.rate = 0.92;
    utterance.addEventListener("start", () => button?.classList.add("is-playing"));
    const clear = () => button?.classList.remove("is-playing");
    utterance.addEventListener("end", clear);
    utterance.addEventListener("error", clear);
    speech.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

function stopCurrentPlayback() {
  try {
    audioElement?.pause?.();
  } catch {}
  audioElement = null;
  try {
    globalThis.speechSynthesis?.cancel?.();
  } catch {}
  button?.classList.remove("is-playing");
}

function ensureAudioButton() {
  if (button?.isConnected) return button;
  button = document.createElement("button");
  button.type = "button";
  button.className = "student-audio-help-btn";
  button.setAttribute("aria-label", "Réécouter la consigne");
  button.title = "Réécouter la consigne";
  button.dataset.skipAutofs = "true";
  button.innerHTML = `
    <svg class="student-audio-help-icon" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
      <path class="student-audio-speaker-body" fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3Z"/>
      <path class="student-audio-wave student-audio-wave-one" d="M15 8.25a5.25 5.25 0 0 1 0 7.5"/>
      <path class="student-audio-wave student-audio-wave-two" d="M18 5.5a9 9 0 0 1 0 13"/>
    </svg>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void playCurrentStudentAudio();
  });
  document.body.appendChild(button);
  syncButtonState();
  return button;
}

function syncButtonState() {
  ensureAudioButton();
  const hasRecordedAudio = assetsLoaded && !!getMatchingRecordedAsset(currentContext);
  const shouldShow = hasRecordedAudio && !isWelcomeOverlayVisible();
  button.hidden = !shouldShow;
  button.disabled = !shouldShow;
}

function getMatchingRecordedAsset(context) {
  if (!context?.key || !context?.text) return null;
  const recordedAsset = assetByKey.get(String(context.key || "")) || null;
  if (!recordedAsset) return null;

  const registeredEntry = registryEntries.find((entry) => entry.key === context.key) || null;
  const expectedRecordedText = String(recordedAsset?.source_text || registeredEntry?.text || "").trim();
  if (!expectedRecordedText) return null;

  return normalizeSpeechText(expectedRecordedText) === normalizeSpeechText(context.text)
    ? recordedAsset
    : null;
}

function syncWelcomeOverlayForRoute(routeName) {
  if (welcomeDismissed || routeName !== "home") {
    if (routeName !== "home") removeWelcomeOverlay();
    syncButtonState();
    return;
  }
  ensureWelcomeOverlay();
  syncButtonState();
}

function ensureWelcomeOverlay() {
  if (welcomeDismissed) return null;
  if (welcomeOverlay?.isConnected) return welcomeOverlay;

  const overlay = document.createElement("div");
  overlay.className = "student-audio-welcome-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Démarrer");
  overlay.innerHTML = `
    <button class="student-audio-welcome-start" type="button" aria-label="Démarrer et écouter la consigne">
      <span class="student-audio-welcome-play" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <path fill="currentColor" d="M24 17.5v29l24-14.5-24-14.5Z"/>
        </svg>
      </span>
      <span class="student-audio-welcome-rocket-stage" aria-hidden="true">
        <span class="student-audio-welcome-rocket-visual">
          <img class="student-audio-welcome-rocket student-audio-welcome-rocket-off" src="./shared/ui-assets/rocket-off.svg" alt="" draggable="false">
          <img class="student-audio-welcome-rocket student-audio-welcome-rocket-on" src="./shared/ui-assets/rocket-on.svg" alt="" draggable="false">
        </span>
      </span>
    </button>`;

  const start = overlay.querySelector(".student-audio-welcome-start");
  start?.addEventListener("click", handleWelcomeStart, { once:true });
  document.body.appendChild(overlay);
  welcomeOverlay = overlay;
  window.requestAnimationFrame(() => start?.focus?.({ preventScroll:true }));
  return overlay;
}

function handleWelcomeStart(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (welcomeLaunching || welcomeDismissed) return;

  welcomeLaunching = true;
  audioUnlocked = true;
  welcomeOverlay?.classList.add("is-launching");

  // La lecture est déclenchée directement par le geste utilisateur : elle
  // bénéficie ainsi du déverrouillage audio imposé par les navigateurs mobiles.
  const firstContext = currentContext?.text
    ? currentContext
    : resolveRouteAudioContext("home");
  if (firstContext?.text) {
    void playResolvedContext(firstContext);
  }

  window.setTimeout(() => {
    welcomeDismissed = true;
    welcomeLaunching = false;
    removeWelcomeOverlay();
    syncButtonState();
  }, 1080);
}

function removeWelcomeOverlay() {
  if (!welcomeOverlay) return;
  try {
    welcomeOverlay.remove();
  } catch {}
  welcomeOverlay = null;
}

function isWelcomeOverlayVisible() {
  return !!welcomeOverlay?.isConnected && !welcomeDismissed;
}

function installUnlockListeners() {
  const unlock = () => { audioUnlocked = true; };
  window.addEventListener("pointerdown", unlock, { capture:true, passive:true });
  window.addEventListener("keydown", unlock, { capture:true });
}

function installToolListeners() {
  window.addEventListener("student:active-tool-changed", (event) => {
    activeToolId = String(event?.detail?.toolId || "").trim();
    awaitingFirstToolInstruction = !!activeToolId;
    if (currentRouteName === "session") {
      const fallback = String(event?.detail?.defaultInstruction || "").trim();
      if (fallback) {
        setStudentAudioContext({
          key:`tool.${activeToolId}.instruction`,
          text:fallback,
          autoPlay:false
        });
      }
    }
  });

  window.addEventListener("tool:instruction-changed", (event) => {
    if (currentRouteName !== "session" || !activeToolId) return;
    const text = String(event?.detail?.text || "").trim();
    if (!text) return;
    const autoPlay = awaitingFirstToolInstruction;
    awaitingFirstToolInstruction = false;
    setStudentAudioContext({
      key:`tool.${activeToolId}.instruction`,
      text,
      autoPlay
    });
  });
}

async function ensureAssetsForAccessCode(accessCode) {
  const normalized = String(accessCode || "").trim().toUpperCase();
  if (assetsAccessCode === normalized && assetsLoaded) return assetByKey;
  if (assetsPromise && assetsAccessCode === normalized) return assetsPromise;
  if (assetsAccessCode !== normalized) assetsLoaded = false;
  assetsAccessCode = normalized;
  assetsPromise = (async () => {
    try {
      const assets = await listPublicInterfaceAudioAssets(normalized);
      assetByKey = new Map((Array.isArray(assets) ? assets : []).map((asset) => [String(asset.audio_key || ""), asset]));
    } catch (error) {
      console.warn("Audios d’interface indisponibles : synthèse vocale utilisée.", error);
      assetByKey = new Map();
    } finally {
      assetsLoaded = true;
      assetsPromise = null;
      syncButtonState();
    }
    return assetByKey;
  })();
  return assetsPromise;
}

function normalizeSpeechText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").normalize("NFC");
}
