const DEFAULT_SURFACE_CAPABILITIES = Object.freeze({
  background: false,
  snap: false,
  annotations: false
});

export function normalizeSurfaceCapabilities(value = {}){
  if (value === true) return { background: true, snap: true, annotations: true };
  if (!value || typeof value !== "object") return { ...DEFAULT_SURFACE_CAPABILITIES };
  return {
    background: value.background === true,
    snap: value.snap === true,
    annotations: value.annotations === true
  };
}

export function defineTeacherTool(definition = {}){
  const id = String(definition?.id || "").trim();
  if (!id) throw new Error("Teacher tool id is required.");
  const label = String(definition?.label || id).trim();
  return Object.freeze({
    ...definition,
    id,
    label,
    icon: String(definition?.icon || "widgets").trim(),
    description: String(definition?.description || "Mini-application du Tableau.").trim(),
    surface: normalizeSurfaceCapabilities(definition?.surface)
  });
}
