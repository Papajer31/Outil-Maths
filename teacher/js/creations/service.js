import {
  TEACHER_RESOURCE_STORAGE_QUOTA_BYTES,
  ensureTujerManagedFolderPathForSpace,
  ensureTujerResourceFoundationForSpace,
  listResourcesForSpace,
  uploadResourceForSpace,
  replacePersonalResourceFile,
  replaceTujerCreationResourceRefs,
  createResourceSignedUrl
} from "../teacher-api.js";
import { getTujerCreationType } from "./registry.js";
import "./builtin-types.js";

const CREATION_FORMAT = "tujer-creation";
const CREATION_FORMAT_VERSION = 1;
const CREATION_MIME = "application/vnd.tujer.creation+json";
const RESOURCE_REF_SCHEME = "tujer-resource://";
export const TUJER_RESOURCES_CHANGED_EVENT = "tujer:resources-changed";

function notifyTujerResourcesChanged(detail = {}){
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent(TUJER_RESOURCES_CHANGED_EVENT, { detail }));
    }
  } catch {}
}

function clonePlain(value){
  try { if (typeof structuredClone === "function") return structuredClone(value); } catch {}
  return JSON.parse(JSON.stringify(value ?? null));
}

function cleanTitle(value, fallback = "Création Tujer"){
  return String(value || fallback).trim().slice(0, 180) || fallback;
}

function resourceRef(resourceId){
  const id = String(resourceId || "").trim();
  return id ? `${RESOURCE_REF_SCHEME}${id}` : "";
}

function resourceIdFromRef(value){
  const source = String(value || "").trim();
  return source.startsWith(RESOURCE_REF_SCHEME) ? source.slice(RESOURCE_REF_SCHEME.length).trim() : "";
}

function safeFileName(value, fallback = "fichier"){
  const source = String(value || fallback).trim() || fallback;
  return source.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 160) || fallback;
}

function guessAssetName(node = {}, fallback = "fichier"){
  return safeFileName(node.imageName || node.pdfName || node.backgroundImageName || node.fileName || node.title || fallback, fallback);
}

function makeNamedBlob(blob, name, mimeType){
  if (typeof File === "function") return new File([blob], name, { type:mimeType || blob.type || "application/octet-stream", lastModified:Date.now() });
  const copy = blob.slice(0, blob.size, mimeType || blob.type || "application/octet-stream");
  try { Object.defineProperty(copy, "name", { value:name, configurable:true }); } catch {}
  return copy;
}

function localFolderForMime(mimeType){
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return { path:["Images"], type:"image" };
  if (mime === "application/pdf") return { path:["Documents"], type:"document" };
  if (mime.startsWith("audio/")) return { path:["Audio"], type:"audio" };
  return null;
}

async function sha256Hex(blob){
  if (!(blob instanceof Blob) || !globalThis.crypto?.subtle) return "";
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sourceToBlob(source){
  const safe = String(source || "").trim();
  if (!safe) return null;
  const response = await fetch(safe);
  if (!response.ok) throw new Error(`Impossible de lire le fichier local (${response.status}).`);
  return await response.blob();
}

function getPersonalResources(rows){
  return (Array.isArray(rows) ? rows : []).filter((resource) => resource?.is_system !== true);
}

function storageUsage(rows, exceptResourceId = ""){
  const except = String(exceptResourceId || "");
  return getPersonalResources(rows).reduce((total, resource) => {
    if (except && String(resource?.id || "") === except) return total;
    return total + Math.max(0, Number(resource?.size_bytes) || 0);
  }, 0);
}

async function assertStorageCapacity(teacherSpaceId, addedBytes, exceptResourceId = ""){
  const rows = await listResourcesForSpace(teacherSpaceId);
  const projected = storageUsage(rows, exceptResourceId) + Math.max(0, Number(addedBytes) || 0);
  if (projected > TEACHER_RESOURCE_STORAGE_QUOTA_BYTES) {
    throw new Error("Le quota de stockage personnel de 100 Mo serait dépassé.");
  }
  return rows;
}

export function isTujerResourceRef(value){
  return Boolean(resourceIdFromRef(value));
}

export function createTujerResourceRef(resourceId){
  return resourceRef(resourceId);
}

export async function ensureTujerCreationsFoundation(teacherSpaceId){
  return await ensureTujerResourceFoundationForSpace(teacherSpaceId);
}

export async function promoteLocalFileToTujerResource({
  teacherSpaceId,
  blob,
  source = "",
  name = "fichier",
  mimeType = "",
  metadata = {}
} = {}){
  let fileBlob = blob instanceof Blob ? blob : null;
  if (!fileBlob && source) fileBlob = await sourceToBlob(source);
  if (!(fileBlob instanceof Blob)) throw new Error("Fichier local introuvable.");
  const effectiveMime = String(fileBlob.type || mimeType || "application/octet-stream").trim().toLowerCase();
  const kind = localFolderForMime(effectiveMime);
  if (!kind) throw new Error("Ce type de fichier local n’est pas encore pris en charge par les créations Tujer.");
  const hash = await sha256Hex(fileBlob);
  const existingRows = await listResourcesForSpace(teacherSpaceId);
  if (hash) {
    const existing = getPersonalResources(existingRows).find((resource) => {
      const local = resource?.metadata?.tujer_local_file;
      return local && String(local.sha256 || "") === hash
        && Number(resource?.size_bytes || 0) === Number(fileBlob.size || 0)
        && String(resource?.mime_type || "").toLowerCase() === effectiveMime;
    });
    if (existing) return existing;
  }
  await assertStorageCapacity(teacherSpaceId, fileBlob.size);
  const folder = await ensureTujerManagedFolderPathForSpace(teacherSpaceId, { root:"local-files", path:kind.path });
  const fileName = safeFileName(name, kind.type === "image" ? "image" : "document.pdf");
  const file = makeNamedBlob(fileBlob, fileName, effectiveMime);
  return await uploadResourceForSpace(teacherSpaceId, file, {
    type:kind.type,
    folder_id:folder?.id || null,
    title:fileName,
    name:fileName,
    metadata:{
      ...metadata,
      tujer_local_file:{
        sha256:hash,
        original_name:fileName,
        imported_at:new Date().toISOString()
      }
    }
  });
}

function collectResourceRefs(value, output = new Set()){
  if (typeof value === "string") {
    const id = resourceIdFromRef(value);
    if (id) output.add(id);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectResourceRefs(item, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  Object.values(value).forEach((item) => collectResourceRefs(item, output));
  return output;
}

export async function externalizeTujerLocalAssets(teacherSpaceId, rawPayload){
  const payload = clonePlain(rawPayload);
  const dependencyIds = new Set();

  async function promoteSource(node, key, nameFallback){
    const current = String(node?.[key] || "").trim();
    if (!current) return;
    const existingId = resourceIdFromRef(current);
    if (existingId) {
      dependencyIds.add(existingId);
      return;
    }
    const blob = await sourceToBlob(current);
    const resource = await promoteLocalFileToTujerResource({
      teacherSpaceId,
      blob,
      name:guessAssetName(node, nameFallback),
      mimeType:blob?.type || ""
    });
    if (!resource?.id) throw new Error("Le fichier local n’a pas pu être pérennisé.");
    node[key] = resourceRef(resource.id);
    dependencyIds.add(resource.id);
  }

  async function walk(value){
    if (Array.isArray(value)) {
      for (const item of value) await walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (String(value.sourceKind || "") === "resource" && value.resourceId) {
      dependencyIds.add(String(value.resourceId || "").trim());
      value.source = "";
    }
    if (String(value.sourceKind || "") === "file" && typeof value.source === "string" && value.source) {
      await promoteSource(value, "source", "fichier");
    }
    if (String(value.backgroundImageKind || "") === "file" && typeof value.backgroundImageSource === "string" && value.backgroundImageSource) {
      await promoteSource(value, "backgroundImageSource", "fond");
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "source" && String(value.sourceKind || "") === "file") continue;
      if (key === "backgroundImageSource" && String(value.backgroundImageKind || "") === "file") continue;
      await walk(child);
    }
  }

  await walk(payload);
  collectResourceRefs(payload, dependencyIds);
  return { payload, dependencyResourceIds:Array.from(dependencyIds) };
}

export async function hydrateTujerResourceRefs(teacherSpaceId, rawPayload){
  const payload = clonePlain(rawPayload);
  const resources = await listResourcesForSpace(teacherSpaceId);
  const resourceById = new Map((Array.isArray(resources) ? resources : []).map((resource) => [String(resource.id), resource]));
  const signedById = new Map();

  async function resolveString(value){
    const id = resourceIdFromRef(value);
    if (!id) return value;
    if (!signedById.has(id)) {
      const resource = resourceById.get(id);
      if (!resource) throw new Error("Un fichier utilisé par cette création n’existe plus.");
      signedById.set(id, await createResourceSignedUrl(resource, 86400));
    }
    return signedById.get(id) || "";
  }

  async function walk(value){
    if (typeof value === "string") return await resolveString(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) value[index] = await walk(value[index]);
      return value;
    }
    if (!value || typeof value !== "object") return value;
    if (String(value.sourceKind || "") === "resource" && value.resourceId) {
      const resource = resourceById.get(String(value.resourceId || ""));
      if (resource) {
        if (!signedById.has(String(resource.id))) signedById.set(String(resource.id), await createResourceSignedUrl(resource, 86400));
        value.source = signedById.get(String(resource.id)) || "";
      }
    }
    for (const key of Object.keys(value)) value[key] = await walk(value[key]);
    return value;
  }
  return await walk(payload);
}

function makeCreationDocument({ type, descriptor, title, payload, metadata = {}, createdAt = null } = {}){
  const now = new Date().toISOString();
  return {
    format:CREATION_FORMAT,
    formatVersion:CREATION_FORMAT_VERSION,
    creationType:type,
    schemaVersion:descriptor.schemaVersion,
    title:cleanTitle(title, descriptor.label),
    createdAt:createdAt || now,
    updatedAt:now,
    metadata:metadata && typeof metadata === "object" && !Array.isArray(metadata) ? clonePlain(metadata) : {},
    payload:clonePlain(payload)
  };
}

export async function saveTujerCreation({
  teacherSpaceId,
  type,
  title,
  payload,
  context,
  resourceId = "",
  metadata = {},
  externalizeLocalAssets = true
} = {}){
  const descriptor = getTujerCreationType(type);
  if (!descriptor) throw new Error(`Type de création Tujer inconnu : ${String(type || "")}.`);
  const serialized = descriptor.serialize ? await descriptor.serialize(context ?? payload) : clonePlain(payload);
  const externalized = externalizeLocalAssets
    ? await externalizeTujerLocalAssets(teacherSpaceId, serialized)
    : { payload:serialized, dependencyResourceIds:Array.from(collectResourceRefs(serialized)) };
  const previousResource = resourceId
    ? getPersonalResources(await listResourcesForSpace(teacherSpaceId)).find((resource) => String(resource.id) === String(resourceId)) || null
    : null;
  let createdAt = null;
  if (previousResource?.type === "creation") {
    try {
      const previousUrl = await createResourceSignedUrl(previousResource, 300);
      const previousResponse = await fetch(previousUrl);
      if (previousResponse.ok) createdAt = String((await previousResponse.json())?.createdAt || "") || null;
    } catch {}
  }
  const document = makeCreationDocument({ type:descriptor.type, descriptor, title, payload:externalized.payload, metadata, createdAt });
  const json = JSON.stringify(document, null, 2);
  const blob = new Blob([json], { type:CREATION_MIME });
  const fileName = `${safeFileName(document.title, "creation")}.tujer.json`;
  const file = makeNamedBlob(blob, fileName, CREATION_MIME);
  await assertStorageCapacity(teacherSpaceId, blob.size, previousResource?.id || "");
  const folder = await ensureTujerManagedFolderPathForSpace(teacherSpaceId, { root:"creations", path:descriptor.folderPath });
  const resourceMetadata = {
    ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
    tujer_creation:{
      type:descriptor.type,
      label:descriptor.label,
      icon:descriptor.icon,
      schema_version:descriptor.schemaVersion,
      format_version:CREATION_FORMAT_VERSION
    }
  };
  const resource = previousResource?.type === "creation"
    ? await replacePersonalResourceFile(previousResource.id, file, {
      type:"creation",
      title:document.title,
      folder_id:folder?.id || null,
      metadata:resourceMetadata
    })
    : await uploadResourceForSpace(teacherSpaceId, file, {
      type:"creation",
      folder_id:folder?.id || null,
      title:document.title,
      name:fileName,
      metadata:resourceMetadata
    });
  const dependencyRows = await listResourcesForSpace(teacherSpaceId);
  const personalIds = new Set(getPersonalResources(dependencyRows).map((item) => String(item.id || "")));
  const dependencyResourceIds = externalized.dependencyResourceIds.filter((id) => personalIds.has(String(id || "")));
  await replaceTujerCreationResourceRefs(teacherSpaceId, resource.id, dependencyResourceIds);
  notifyTujerResourcesChanged({
    teacherSpaceId:String(teacherSpaceId || ""),
    resourceId:String(resource?.id || ""),
    resourceType:"creation",
    action:previousResource?.type === "creation" ? "updated" : "created"
  });
  return { resource, document, dependencyResourceIds };
}

function validateCreationDocument(document){
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Création Tujer invalide.");
  if (String(document.format || "") !== CREATION_FORMAT) throw new Error("Format de création Tujer inconnu.");
  if (Math.max(1, Number(document.formatVersion) || 1) > CREATION_FORMAT_VERSION) throw new Error("Cette création a été produite par une version plus récente de Tujer.");
  return document;
}

export async function loadTujerCreation({ teacherSpaceId, resource, hydrate = true } = {}){
  if (!resource || String(resource.type || "") !== "creation") throw new Error("Cette ressource n’est pas une création Tujer.");
  const url = await createResourceSignedUrl(resource, 86400);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Impossible de charger la création (${response.status}).`);
  const document = validateCreationDocument(await response.json());
  document.title = cleanTitle(resource?.title || document.title || "Création Tujer");
  const descriptor = getTujerCreationType(document.creationType);
  if (!descriptor) throw new Error(`Le type « ${String(document.creationType || "")} » n’est pas disponible dans cette version de Tujer.`);
  let payload = clonePlain(document.payload);
  if (Number(document.schemaVersion || 1) !== descriptor.schemaVersion && descriptor.migrate) {
    payload = await descriptor.migrate(payload, Number(document.schemaVersion || 1), descriptor.schemaVersion);
  }
  if (hydrate) payload = await hydrateTujerResourceRefs(teacherSpaceId, payload);
  if (descriptor.restore) payload = await descriptor.restore(payload, { document, resource });
  return { resource, document, payload, descriptor };
}
