const MODULE_MANIFEST_URL = new URL("./manifest.json", import.meta.url);

export function createMathsModuleRuntime() {
  let manifestPromise = null;

  return {
    loadToolsCatalog,
    loadToolModule
  };

  async function loadToolsCatalog() {
    const manifest = await loadManifest();
    const toolsMap = manifest.tools || {};

    return Object.entries(toolsMap).map(([id, def]) => ({
      id,
      title: def.label || id
    }));
  }

  async function loadToolModule(toolId) {
    const manifest = await loadManifest();
    const toolDef = manifest?.tools?.[toolId];

    if (!toolDef) {
      throw new Error(`Outil inconnu dans le module maths : ${toolId}`);
    }

    if (!toolDef.entry) {
      throw new Error(`Entrée manquante pour l’outil ${toolId}`);
    }

    const entryUrl = new URL(toolDef.entry, import.meta.url);
    return await import(entryUrl.href);
  }

  async function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetchJSON(MODULE_MANIFEST_URL.href);
    }
    return await manifestPromise;
  }
}

async function fetchJSON(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`Impossible de charger ${path} (${r.status})`);
  }
  return await r.json();
}