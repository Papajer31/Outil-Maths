const STORAGE_PREFIX = "adminDraftRuntime:";
const MAX_PENDING_AGE_MS = 1000 * 60 * 60 * 6;

export const ADMIN_DRAFT_RUNTIME_STORAGE_PREFIX = STORAGE_PREFIX;

export function createAdminDraftRuntimeStorageKey(token) {
  const normalizedToken = String(token || "").trim();
  return normalizedToken ? `${STORAGE_PREFIX}${normalizedToken}` : "";
}

export function persistAdminDraftRuntimePayload(token, payload) {
  const key = createAdminDraftRuntimeStorageKey(token);
  if (!key) {
    throw new Error("Impossible de préparer le banc runtime.");
  }

  const raw = JSON.stringify(payload);

  // Une clé locale n'est qu'un sas entre le tableau de bord et le nouvel onglet.
  // On ne conserve donc jamais d'anciens payloads volumineux en parallèle.
  cleanupAdminDraftRuntimePayloads(localStorage, { removeAll: true });

  try {
    localStorage.setItem(key, raw);
  } catch (error) {
    // Nettoyage défensif des clés laissées par d'anciennes versions, puis un seul essai.
    cleanupAdminDraftRuntimePayloads(localStorage, { removeAll: true });
    try {
      localStorage.setItem(key, raw);
    } catch (retryError) {
      const quotaError = new Error(
        "Le stockage local du site est plein. Efface les données du site si le problème persiste, puis réessaie."
      );
      quotaError.name = retryError?.name || error?.name || "QuotaExceededError";
      quotaError.cause = retryError;
      throw quotaError;
    }
  }
}

/**
 * Déplace le payload temporaire de localStorage vers le sessionStorage du banc.
 * Les iframes de même origine partagent ce sessionStorage dans le même onglet :
 * les changements de résolution et les relances continuent donc de fonctionner,
 * tandis que la grosse donnée disparaît immédiatement du stockage persistant.
 */
export function adoptAdminDraftRuntimePayloadForTab(token) {
  const key = createAdminDraftRuntimeStorageKey(token);
  if (!key) return false;

  let raw = "";
  try {
    raw = localStorage.getItem(key) || "";
  } catch {}

  if (!raw) {
    try {
      return !!sessionStorage.getItem(key);
    } catch {
      return false;
    }
  }

  try {
    sessionStorage.setItem(key, raw);
    localStorage.removeItem(key);
    return true;
  } catch {
    // Si sessionStorage est indisponible, on garde le fallback local afin de
    // ne pas empêcher le banc de démarrer.
    return false;
  }
}

export function readAdminDraftRuntimePayload(token) {
  const key = createAdminDraftRuntimeStorageKey(token);
  if (!key) return null;

  let raw = "";
  try {
    raw = sessionStorage.getItem(key) || "";
  } catch {}

  if (!raw) {
    try {
      raw = localStorage.getItem(key) || "";
    } catch {}
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    removeAdminDraftRuntimePayload(token);
    return null;
  }
}

export function removeAdminDraftRuntimePayload(token) {
  const key = createAdminDraftRuntimeStorageKey(token);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {}
  try {
    sessionStorage.removeItem(key);
  } catch {}
}

export function cleanupAdminDraftRuntimePayloads(
  storage,
  { removeAll = false, maxAgeMs = MAX_PENDING_AGE_MS } = {}
) {
  if (!storage) return 0;

  let removed = 0;
  const now = Date.now();

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;

      let shouldRemove = removeAll;
      if (!shouldRemove) {
        try {
          const payload = JSON.parse(storage.getItem(key) || "null");
          const createdAt = Number(payload?.createdAt || 0);
          shouldRemove = !createdAt || now - createdAt > maxAgeMs;
        } catch {
          shouldRemove = true;
        }
      }

      if (shouldRemove) {
        storage.removeItem(key);
        removed += 1;
      }
    }
  } catch {}

  return removed;
}
