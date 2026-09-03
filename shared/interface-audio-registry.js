import { getActiveToolsRegistry } from "../tools/registry.js";

const STATIC_INTERFACE_AUDIO_ENTRIES = Object.freeze([
  {
    key: "student.home.class-code",
    category: "Navigation élève",
    label: "Accueil — code de classe",
    text: "Écris le code de ta classe puis appuie sur Connexion."
  },
  {
    key: "student.mode.choose",
    category: "Navigation élève",
    label: "Choix seul ou groupe",
    text: "Choisis si tu es tout seul ou si vous êtes plusieurs."
  },
  {
    key: "student.students.choose-one",
    category: "Navigation élève",
    label: "Choix de l’élève",
    text: "Choisis ton prénom."
  },
  {
    key: "student.students.choose-group",
    category: "Navigation élève",
    label: "Choix du groupe",
    text: "Choisissez vos prénoms puis appuyez sur Valider."
  },
  {
    key: "student.hub.default",
    category: "Navigation élève",
    label: "Accueil des modes",
    text: "Choisis ce que tu veux faire."
  },
  {
    key: "student.hub.mission-available",
    category: "Navigation élève",
    label: "Accueil des modes — mission disponible",
    text: "Tu as une mission à faire. Tu peux commencer par ta mission."
  },
  {
    key: "student.exploration.choose",
    category: "Exploration",
    label: "Exploration — choisir",
    text: "Choisis ce que tu veux travailler."
  },
  {
    key: "student.missions.choose",
    category: "Missions",
    label: "Missions — choisir",
    text: "Choisis une mission."
  },
  {
    key: "student.adventure.continue",
    category: "Aventure",
    label: "Aventure — continuer",
    text: "Continue ton aventure."
  },
  {
    key: "student.session.start",
    category: "Activité",
    label: "Avant une activité",
    text: "Appuie sur la fusée pour commencer."
  }
]);

let registryPromise = null;

export function getStaticInterfaceAudioRegistryEntries() {
  return STATIC_INTERFACE_AUDIO_ENTRIES.map((entry) => ({ ...entry }));
}

export async function getInterfaceAudioRegistryEntries() {
  if (!registryPromise) {
    registryPromise = buildInterfaceAudioRegistryEntries();
  }
  const entries = await registryPromise;
  return entries.map((entry) => ({ ...entry }));
}

export function getInterfaceAudioRegistryEntry(entries, audioKey) {
  const key = String(audioKey || "").trim();
  if (!key) return null;
  return (Array.isArray(entries) ? entries : []).find((entry) => entry.key === key) || null;
}

async function buildInterfaceAudioRegistryEntries() {
  const entries = getStaticInterfaceAudioRegistryEntries();
  const tools = getActiveToolsRegistry();

  const toolEntries = await Promise.all(tools.map(async (toolMeta) => {
    const toolId = String(toolMeta?.id || "").trim();
    if (!toolId) return null;
    try {
      const entryUrl = new URL(String(toolMeta.entry || ""), new URL("../tools/registry.js", import.meta.url));
      const mod = await import(entryUrl.href);
      const tool = mod?.default && typeof mod.default === "object" ? mod.default : {};
      const text = String(tool.defaultInstruction || "").trim();
      if (!text) return null;
      return {
        key: `tool.${toolId}.instruction`,
        category: "Consignes des outils",
        label: `${String(toolMeta.label || toolId).trim()} — consigne`,
        text,
        toolId
      };
    } catch (error) {
      console.warn(`Consigne audio introuvable pour l’outil ${toolId}.`, error);
      return null;
    }
  }));

  toolEntries.filter(Boolean).forEach((entry) => entries.push(entry));
  return entries.sort((a, b) => {
    const categoryCompare = String(a.category || "").localeCompare(String(b.category || ""), "fr", { sensitivity:"base" });
    if (categoryCompare) return categoryCompare;
    return String(a.label || a.key).localeCompare(String(b.label || b.key), "fr", { sensitivity:"base" });
  });
}
