import { getInterfaceAudioRegistryEntries } from "../../../shared/interface-audio-registry.js";
import { openAudioRecorderDialog } from "./audio-recorder-dialog.js";
import { escapeHtml, escapeAttr } from "./text-utils.js";

export function createAudioAdminViewController({
  view,
  listImagierAudioEntriesAsAdmin,
  listInterfaceAudioAssetsAsAdmin,
  uploadSystemInterfaceAudioAsAdmin,
  deleteSystemInterfaceAudioAsAdmin,
  getInterfaceAudioAssetPublicUrl,
  showToast
} = {}) {
  let registry = [];
  let assets = [];
  let isLoading = false;
  let activeCategory = "all";
  let activeImagierFolder = "all";
  let onlyMissing = false;
  let activeAudio = null;

  async function refresh() {
    if (!view || isLoading) return;
    isLoading = true;
    render();
    try {
      const [staticRegistry, imagierRegistry, nextAssets] = await Promise.all([
        getInterfaceAudioRegistryEntries(),
        listImagierAudioEntriesAsAdmin?.(),
        listInterfaceAudioAssetsAsAdmin?.()
      ]);
      const merged = [
        ...(Array.isArray(staticRegistry) ? staticRegistry : []),
        ...(Array.isArray(imagierRegistry) ? imagierRegistry : [])
      ];
      const byKey = new Map();
      for (const entry of merged) {
        const key = String(entry?.key || "").trim();
        if (!key) continue;
        byKey.set(key, { ...entry, key });
      }
      registry = [...byKey.values()].sort(compareRegistryEntries);
      assets = Array.isArray(nextAssets) ? nextAssets : [];
    } catch (error) {
      console.error("Impossible de charger le centre audio.", error);
      showToast?.(error?.message || "Impossible de charger le centre audio.", { isError:true });
    } finally {
      isLoading = false;
      render();
    }
  }

  function compareRegistryEntries(a, b) {
    const categoryCompare = String(a?.category || "").localeCompare(String(b?.category || ""), "fr", { sensitivity:"base", numeric:true });
    if (categoryCompare) return categoryCompare;
    const folderCompare = String(a?.imagierFolderPath || "").localeCompare(String(b?.imagierFolderPath || ""), "fr", { sensitivity:"base", numeric:true });
    if (folderCompare) return folderCompare;
    return String(a?.label || a?.key || "").localeCompare(String(b?.label || b?.key || ""), "fr", { sensitivity:"base", numeric:true });
  }

  function getAssetMap() {
    return new Map(assets.map((asset) => [String(asset.audio_key || ""), asset]));
  }

  function normalizeAudioText(value) {
    return String(value || "")
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("fr-FR");
  }

  function getCurrentAsset(entry, assetMap) {
    const asset = assetMap.get(String(entry?.key || "")) || null;
    if (!asset) return null;
    return normalizeAudioText(asset.source_text) === normalizeAudioText(entry?.text)
      ? asset
      : null;
  }

  function getImagierFolderOptions() {
    const entries = registry.filter((entry) => entry.category === "Imagier");
    const byId = new Map();
    for (const entry of entries) {
      const id = String(entry.imagierFolderId || "").trim();
      if (!id) continue;
      const label = String(entry.imagierFolderPath || "").trim() || "Racine de l’Imagier";
      if (!byId.has(id)) byId.set(id, label);
    }
    return [...byId.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity:"base", numeric:true }));
  }

  function matchesScope(entry) {
    if (activeCategory !== "all" && entry.category !== activeCategory) return false;
    if (activeCategory === "Imagier" && activeImagierFolder !== "all") {
      return String(entry.imagierFolderId || "") === activeImagierFolder;
    }
    return true;
  }

  function getScopedRegistry() {
    return registry.filter(matchesScope);
  }

  function render() {
    if (!view) return;
    const assetMap = getAssetMap();
    const imagierFolders = getImagierFolderOptions();
    if (activeCategory === "Imagier" && activeImagierFolder !== "all"
      && !imagierFolders.some((folder) => folder.id === activeImagierFolder)) {
      activeImagierFolder = "all";
    }
    const scopedRegistry = getScopedRegistry();
    const doneCount = scopedRegistry.filter((entry) => !!getCurrentAsset(entry, assetMap)).length;
    const totalCount = scopedRegistry.length;
    const missingCount = Math.max(0, totalCount - doneCount);
    const categories = [...new Set(registry.map((entry) => String(entry.category || "Autres")))];
    const visible = scopedRegistry.filter((entry) => {
      if (onlyMissing && getCurrentAsset(entry, assetMap)) return false;
      return true;
    });
    const scopeLabel = activeCategory === "all" ? "" : `${activeCategory} : `;

    view.innerHTML = `
      <div class="dashboard-audio-admin">
        <div class="dashboard-audio-admin-header">
          <div>
            <div class="dashboard-section-title">Centre audio</div>
            <div class="dashboard-audio-admin-summary">
              ${isLoading ? "Chargement…" : `${escapeHtml(scopeLabel)}${doneCount} / ${totalCount} audios enregistrés · ${missingCount} à faire`}
            </div>
          </div>
          <div class="dashboard-audio-admin-actions">
            <button class="btn primary dashboard-btn-with-icon" type="button" data-audio-admin-record-missing ${missingCount && !isLoading ? "" : "disabled"}>
              <span class="dashboard-material-icon" aria-hidden="true">mic</span>
              Enregistrer les manquants
            </button>
            <button class="btn dashboard-btn-with-icon" type="button" data-audio-admin-refresh ${isLoading ? "disabled" : ""}>
              <span class="dashboard-material-icon" aria-hidden="true">refresh</span>
              Actualiser
            </button>
          </div>
        </div>

        <div class="dashboard-audio-admin-toolbar">
          <label>
            Catégorie
            <select data-audio-admin-category>
              <option value="all">Toutes</option>
              ${categories.map((category) => `<option value="${escapeAttr(category)}" ${category === activeCategory ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
            </select>
          </label>
          ${activeCategory === "Imagier" && imagierFolders.length > 1 ? `
            <label>
              Dossier de l’Imagier
              <select data-audio-admin-imagier-folder>
                <option value="all">Tous</option>
                ${imagierFolders.map((folder) => `<option value="${escapeAttr(folder.id)}" ${folder.id === activeImagierFolder ? "selected" : ""}>${escapeHtml(folder.label)}</option>`).join("")}
              </select>
            </label>
          ` : ""}
          <label class="dashboard-audio-admin-check">
            <input type="checkbox" data-audio-admin-only-missing ${onlyMissing ? "checked" : ""}>
            Seulement les audios manquants
          </label>
        </div>

        <div class="dashboard-audio-admin-list">
          ${isLoading && !registry.length ? `<div class="dashboard-activity-empty-state">Chargement du registre audio…</div>` : ""}
          ${!isLoading && activeCategory === "Imagier" && !registry.some((entry) => entry.category === "Imagier") ? `<div class="dashboard-activity-empty-state">Aucune image n’est actuellement classée dans le dossier « Imagier ».</div>` : ""}
          ${!isLoading && registry.length && !visible.length ? `<div class="dashboard-activity-empty-state">Aucun audio dans ce filtre.</div>` : ""}
          ${visible.map((entry) => renderEntry(entry, getCurrentAsset(entry, assetMap))).join("")}
        </div>
      </div>
    `;
    bind();
  }

  function renderEntry(entry, asset) {
    const isImagier = entry.category === "Imagier";
    const folderLabel = String(entry.imagierFolderPath || "").trim();
    return `
      <article class="dashboard-audio-admin-row ${asset ? "is-recorded" : "is-missing"} ${isImagier ? "has-image-preview" : ""}" data-audio-key="${escapeAttr(entry.key)}">
        <div class="dashboard-audio-admin-state" title="${asset ? "Enregistré" : "À enregistrer"}">
          <span class="dashboard-material-icon" aria-hidden="true">${asset ? "check_circle" : "radio_button_unchecked"}</span>
        </div>
        ${isImagier ? `
          <div class="dashboard-audio-admin-image-preview" title="${escapeAttr(entry.label || "Image de l’Imagier")}">
            <span class="dashboard-material-icon" aria-hidden="true">image</span>
            ${entry.imageUrl ? `<img src="${escapeAttr(entry.imageUrl)}" alt="" loading="lazy" data-audio-admin-image>` : ""}
          </div>
        ` : ""}
        <div class="dashboard-audio-admin-copy">
          <div class="dashboard-audio-admin-meta">
            <span class="dashboard-audio-admin-category">${escapeHtml(entry.category || "Autres")}${folderLabel ? ` · ${escapeHtml(folderLabel)}` : ""}</span>
            <span class="dashboard-audio-admin-label">${escapeHtml(entry.label || entry.key)}</span>
          </div>
          <div class="dashboard-audio-admin-text">« ${escapeHtml(entry.text)} »</div>
          <code class="dashboard-audio-admin-key">${escapeHtml(entry.key)}</code>
        </div>
        <div class="dashboard-audio-admin-row-actions">
          ${asset ? `
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-audio-admin-play="${escapeAttr(entry.key)}" aria-label="Écouter" title="Écouter">
              <span class="dashboard-material-icon" aria-hidden="true">play_arrow</span>
            </button>
          ` : ""}
          <button class="btn ${asset ? "" : "primary"}" type="button" data-audio-admin-record="${escapeAttr(entry.key)}">
            ${asset ? "Réenregistrer" : "Enregistrer"}
          </button>
          ${asset ? `
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-audio-admin-delete="${escapeAttr(entry.key)}" aria-label="Supprimer l’audio" title="Supprimer l’audio">
              <span class="dashboard-material-icon" aria-hidden="true">delete</span>
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }

  function bind() {
    view.querySelector("[data-audio-admin-refresh]")?.addEventListener("click", () => void refresh());
    view.querySelector("[data-audio-admin-record-missing]")?.addEventListener("click", () => void recordMissingSequence());
    view.querySelector("[data-audio-admin-category]")?.addEventListener("change", (event) => {
      activeCategory = String(event.target.value || "all");
      if (activeCategory !== "Imagier") activeImagierFolder = "all";
      render();
    });
    view.querySelector("[data-audio-admin-imagier-folder]")?.addEventListener("change", (event) => {
      activeImagierFolder = String(event.target.value || "all");
      render();
    });
    view.querySelector("[data-audio-admin-only-missing]")?.addEventListener("change", (event) => {
      onlyMissing = event.target.checked === true;
      render();
    });
    view.querySelectorAll("[data-audio-admin-record]").forEach((button) => {
      button.addEventListener("click", () => void recordEntryByKey(button.dataset.audioAdminRecord));
    });
    view.querySelectorAll("[data-audio-admin-play]").forEach((button) => {
      button.addEventListener("click", () => playByKey(button.dataset.audioAdminPlay, button));
    });
    view.querySelectorAll("[data-audio-admin-delete]").forEach((button) => {
      button.addEventListener("click", () => void deleteByKey(button.dataset.audioAdminDelete));
    });
    view.querySelectorAll("[data-audio-admin-image]").forEach((image) => {
      image.addEventListener("error", () => image.closest(".dashboard-audio-admin-image-preview")?.classList.add("is-error"), { once:true });
    });
  }

  async function recordEntryByKey(audioKey, { quiet = false } = {}) {
    const entry = registry.find((item) => item.key === String(audioKey || ""));
    if (!entry) return null;
    const result = await openAudioRecorderDialog({
      defaultTitle: entry.label,
      promptText: entry.text,
      lockTitle: true,
      onSaveRecording: async ({ blob, duration, mimeType }) => {
        const saved = await uploadSystemInterfaceAudioAsAdmin?.(entry.key, blob, {
          title: entry.label,
          text: entry.text,
          duration,
          mimeType,
          metadata: entry.category === "Imagier"
            ? { source:"imagier", image_slug:String(entry.imageSlug || ""), resource_id:String(entry.resourceId || "") }
            : {}
        });
        return saved;
      },
      showToast: quiet ? null : showToast
    });
    if (result) {
      await reloadAssetsOnly();
      if (!quiet) showToast?.(`Audio « ${entry.label} » enregistré.`);
    }
    return result;
  }

  async function recordMissingSequence() {
    const assetMap = getAssetMap();
    const queue = getScopedRegistry().filter((entry) => !getCurrentAsset(entry, assetMap));
    if (!queue.length) return;
    let recorded = 0;
    for (const entry of queue) {
      const result = await recordEntryByKey(entry.key, { quiet:true });
      if (!result) break;
      recorded += 1;
    }
    if (recorded) showToast?.(`${recorded} audio${recorded > 1 ? "s" : ""} enregistré${recorded > 1 ? "s" : ""}.`);
  }

  function playByKey(audioKey, buttonEl) {
    const asset = assets.find((item) => String(item.audio_key || "") === String(audioKey || ""));
    if (!asset) return;
    const url = getInterfaceAudioAssetPublicUrl?.(asset) || "";
    if (!url) return;
    try { activeAudio?.pause?.(); } catch {}
    activeAudio = new Audio(url);
    const icon = buttonEl?.querySelector(".dashboard-material-icon");
    if (icon) icon.textContent = "pause";
    const clear = () => { if (icon) icon.textContent = "play_arrow"; };
    activeAudio.addEventListener("ended", clear, { once:true });
    activeAudio.addEventListener("pause", clear, { once:true });
    void activeAudio.play().catch(() => clear());
  }

  async function deleteByKey(audioKey) {
    const entry = registry.find((item) => item.key === String(audioKey || ""));
    if (!entry) return;
    const message = entry.category === "Imagier"
      ? `Supprimer l’audio du mot « ${entry.label} » ? Il réapparaîtra dans les audios de l’Imagier à enregistrer.`
      : `Supprimer l’audio système « ${entry.label} » ? La synthèse vocale sera utilisée tant qu’il n’est pas réenregistré.`;
    const ok = window.confirm(message);
    if (!ok) return;
    try {
      await deleteSystemInterfaceAudioAsAdmin?.(entry.key);
      await reloadAssetsOnly();
      showToast?.(`Audio « ${entry.label} » supprimé.`);
    } catch (error) {
      showToast?.(error?.message || "Suppression impossible.", { isError:true });
    }
  }

  async function reloadAssetsOnly() {
    try {
      const nextAssets = await listInterfaceAudioAssetsAsAdmin?.();
      assets = Array.isArray(nextAssets) ? nextAssets : [];
      render();
    } catch (error) {
      console.error("Impossible d’actualiser les audios.", error);
    }
  }

  return { refresh, render };
}
