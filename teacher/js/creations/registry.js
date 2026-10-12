const registry = new Map();

function cleanId(value){
  return String(value || "").trim().toLowerCase();
}

function cleanPath(value){
  return (Array.isArray(value) ? value : [])
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}

function normalizeDefinition(definition = {}){
  const type = cleanId(definition.type || definition.id);
  if (!type) throw new Error("Type de création Tujer manquant.");
  const label = String(definition.label || type).trim() || type;
  const folderPath = cleanPath(definition.folderPath);
  if (!folderPath.length) throw new Error(`Dossier de destination manquant pour « ${label} ».`);
  const schemaVersion = Math.max(1, Math.trunc(Number(definition.schemaVersion) || 1));
  return Object.freeze({
    type,
    label,
    icon:String(definition.icon || "deployed_code").trim() || "deployed_code",
    folderPath:Object.freeze(folderPath),
    schemaVersion,
    serialize:typeof definition.serialize === "function" ? definition.serialize : null,
    restore:typeof definition.restore === "function" ? definition.restore : null,
    migrate:typeof definition.migrate === "function" ? definition.migrate : null
  });
}

export function registerTujerCreationType(definition = {}){
  const requestedType = cleanId(definition.type || definition.id);
  const existing = requestedType ? registry.get(requestedType) : null;
  const normalized = normalizeDefinition(existing ? { ...existing, ...definition, type:requestedType } : definition);
  registry.set(normalized.type, normalized);
  return normalized;
}

export function getTujerCreationType(type){
  return registry.get(cleanId(type)) || null;
}

export function listTujerCreationTypes(){
  return Array.from(registry.values());
}

export function unregisterTujerCreationType(type){
  return registry.delete(cleanId(type));
}
