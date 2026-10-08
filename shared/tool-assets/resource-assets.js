function getResourceFolderPath(folderId, foldersById){
  const parts = [];
  const visited = new Set();
  let currentId = String(folderId || "").trim();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = foldersById.get(currentId);
    if (!folder) break;
    parts.unshift(String(folder.name || "Dossier").trim() || "Dossier");
    currentId = String(folder.parent_id || "").trim();
  }
  return parts.join(" / ") || "Sans dossier";
}

export async function loadTeacherResourceAssets({
  teacherSpaceId,
  type = "image",
  systemOnly = false,
  listResourcesForSpace,
  listResourceFoldersForSpace,
  createResourceSignedUrl,
  signedUrlTtlSeconds = 86400
} = {}){
  const safeType = String(type || "image").trim().toLowerCase() === "audio" ? "audio" : "image";

  if (typeof listResourcesForSpace !== "function") {
    return { assets:[], folders:[] };
  }

  const [folderRows, resourceRows] = await Promise.all([
    typeof listResourceFoldersForSpace === "function"
      ? listResourceFoldersForSpace(teacherSpaceId)
      : [],
    listResourcesForSpace(teacherSpaceId)
  ]);

  const visibleFolders = (Array.isArray(folderRows) ? folderRows : []).filter((folder) =>
    !systemOnly || folder?.is_system === true
  );
  const foldersById = new Map(visibleFolders.map((folder) => [String(folder.id || ""), folder]));
  const resources = (Array.isArray(resourceRows) ? resourceRows : []).filter((resource) =>
    resource?.type === safeType && (!systemOnly || resource?.is_system === true)
  );

  const folders = visibleFolders.map((folder, index) => ({
    id:String(folder?.id || ""),
    parentId:String(folder?.parent_id || "").trim() || null,
    label:String(folder?.name || "Dossier").trim() || "Dossier",
    scope:folder?.is_system === true ? "system" : "personal",
    display_order:Number.isFinite(Number(folder?.display_order)) ? Number(folder.display_order) : index
  })).filter((folder) => folder.id);

  const assets = await Promise.all(resources.map(async (resource, index) => {
    let url = String(resource?.url || "").trim();
    if (!url && resource?.storage_path && typeof createResourceSignedUrl === "function") {
      try { url = await createResourceSignedUrl(resource, signedUrlTtlSeconds); }
      catch (error) { console.warn(`Impossible de signer une ressource ${safeType}.`, error); }
    }
    const folderId = String(resource?.folder_id || "").trim() || null;
    const folderPath = getResourceFolderPath(folderId, foldersById);
    return {
      id:`resource:${resource.id}`,
      resourceId:String(resource.id || ""),
      type:safeType,
      scope:resource?.is_system === true ? "system" : "personal",
      folderId,
      folderPath:folderPath === "Sans dossier" ? "" : folderPath,
      category:folderPath,
      label:String(resource?.title || (safeType === "audio" ? "Audio" : "Image")),
      alt:String(resource?.alt || resource?.title || (safeType === "audio" ? "Audio" : "Image")),
      tags:Array.isArray(resource?.tags) ? resource.tags : [],
      mimeType:String(resource?.mime_type || `${safeType}/*`),
      width:Math.max(0, Number(resource?.width) || 0),
      height:Math.max(0, Number(resource?.height) || 0),
      duration:Math.max(0, Number(resource?.duration) || 0),
      display_order:Number.isFinite(Number(resource?.display_order)) ? Number(resource.display_order) : index,
      url
    };
  }));

  return {
    assets:assets.filter((asset) => asset.resourceId && asset.url),
    folders
  };
}
