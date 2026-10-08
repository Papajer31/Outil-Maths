// Compatibilité transitoire : le picker réel est désormais le composant commun.
import { openToolAssetPicker } from "../../../shared/tool-assets/asset-picker.js";
import { loadTeacherResourceAssets } from "../../../shared/tool-assets/resource-assets.js";

export function openTeacherResourceImagePicker({
  teacherSpaceId,
  multiple = false,
  listResourcesForSpace,
  listResourceFoldersForSpace,
  createResourceSignedUrl,
  title,
  submitLabel,
  showToast
} = {}){
  if (!Number.isSafeInteger(Number(teacherSpaceId)) || Number(teacherSpaceId) <= 0) {
    showToast?.("Les ressources sont indisponibles pour cet espace.", { isError:true });
    return Promise.resolve(null);
  }
  return openToolAssetPicker({
    type:"image",
    title:title || (multiple ? "Ajouter des images" : "Choisir une image"),
    multiple,
    confirmLabel:submitLabel || "Ajouter",
    loadAssets:() => loadTeacherResourceAssets({
      teacherSpaceId:Number(teacherSpaceId),
      type:"image",
      listResourcesForSpace,
      listResourceFoldersForSpace,
      createResourceSignedUrl
    }),
    emptyMessage:"Aucune image disponible dans ce dossier."
  });
}
