import { supabase } from "./supabase-client.js";

const SYSTEM_ASSET_BASE_URL = new URL("./tool-assets/manifest.json", import.meta.url);
const resourceUrlCache = new Map();
const RESOURCE_SIGNED_URL_LIFETIME_SECONDS = 3600;
const RESOURCE_SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function normalizeQuizAudioSource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const rawKind = String(source.kind || source.type || "").trim().toLowerCase();
  const kind = rawKind === "site-asset" || rawKind === "system" || rawKind === "asset"
    ? "site-asset"
    : rawKind === "resource" || rawKind === "supabase-resource" || rawKind === "personal-resource" || rawKind === "system-resource"
      ? "resource"
      : "";
  if (!kind) return null;

  if (kind === "site-asset") {
    const assetId = String(source.assetId || source.asset_id || source.id || "").trim();
    const src = String(source.src || source.path || "").trim();
    if (!assetId && !src) return null;
    return {
      kind,
      assetId,
      src,
      label: String(source.label || source.name || assetId || "Audio").trim() || "Audio",
      mimeType: String(source.mimeType || source.mime_type || "audio/*").trim() || "audio/*",
      duration: Math.max(0, Number(source.duration) || 0)
    };
  }

  const resourceId = String(source.resourceId || source.resource_id || source.id || "").trim();
  if (!resourceId) return null;
  return {
    kind,
    resourceId,
    label: String(source.label || source.name || source.title || "Audio").trim() || "Audio",
    mimeType: String(source.mimeType || source.mime_type || "audio/*").trim() || "audio/*",
    duration: Math.max(0, Number(source.duration) || 0)
  };
}

export async function resolveQuizAudioSourceUrl(source) {
  const normalized = normalizeQuizAudioSource(source);
  if (!normalized) return "";

  if (normalized.kind === "site-asset") {
    if (!normalized.src) return "";
    return new URL(normalized.src, SYSTEM_ASSET_BASE_URL).href;
  }

  return await resolveResourceAudioUrl(normalized.resourceId);
}

async function resolveResourceAudioUrl(resourceId) {
  const id = String(resourceId || "").trim();
  if (!id) return "";

  const cached = resourceUrlCache.get(id);
  if (cached?.url && Number(cached.expiresAt) - RESOURCE_SIGNED_URL_REFRESH_MARGIN_MS > Date.now()) {
    return cached.url;
  }

  const { data: resource, error } = await supabase
    .from("resources")
    .select("id, resource_type, storage_bucket, storage_path")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (!resource || String(resource.resource_type || "") !== "audio") return "";

  const bucket = String(resource.storage_bucket || "teacher-resources").trim();
  const path = String(resource.storage_path || "").trim();
  if (!bucket || !path) return "";

  const { data, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, RESOURCE_SIGNED_URL_LIFETIME_SECONDS);
  if (signedError) throw signedError;
  const url = String(data?.signedUrl || "").trim();
  if (!url) return "";

  resourceUrlCache.set(id, {
    url,
    expiresAt: Date.now() + RESOURCE_SIGNED_URL_LIFETIME_SECONDS * 1000
  });
  return url;
}
