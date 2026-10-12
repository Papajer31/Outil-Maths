export function normalizeActivitySearch(value){
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
}

export function createActivitySearchEntries(activities = [], folders = [], { rootLabel = "Exploration", source = "exploration" } = {}){
  const folderById = new Map(folders.map((folder) => [String(folder.id), folder]));
  return activities.map((activity) => {
    const trail = [];
    const seen = new Set();
    let folder = folderById.get(String(activity.folder_id ?? activity.pedagogical_node_id ?? "").trim());
    while (folder && !seen.has(String(folder.id))) {
      seen.add(String(folder.id));
      trail.unshift(folder.name);
      folder = folderById.get(String(folder.parent_id || ""));
    }
    const title = String(activity.config_name || activity.title || "Activité");
    const path = [rootLabel, ...trail].join(" › ");
    return { activity, title, path, source, searchText:normalizeActivitySearch(`${title} ${activity.description || ""} ${path}`) };
  }).sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity:"base" }));
}

export function filterActivitySearchEntries(entries, query){
  const terms = normalizeActivitySearch(query).split(/\s+/).filter(Boolean);
  return entries.filter((entry) => terms.every((term) => entry.searchText.includes(term)));
}
