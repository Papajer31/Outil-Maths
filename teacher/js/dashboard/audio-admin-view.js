import { getInterfaceAudioRegistryEntries } from "../../../shared/interface-audio-registry.js";
import { openAudioRecorderDialog } from "./audio-recorder-dialog.js";
import { escapeHtml, escapeAttr } from "./text-utils.js";

export function createAudioAdminViewController({
  view,
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
  let onlyMissing = false;
  let activeAudio = null;

  async function refresh() {
    if (!view || isLoading) return;
    isLoading = true;
    render();
    try {
      const [nextRegistry, nextAssets] = await Promise.all([
        getInterfaceAudioRegistryEntries(),
        listInterfaceAudioAssetsAsAdmin?.()
      ]);
      registry = Array.isArray(nextRegistry) ? nextRegistry : [];
      assets = Array.isArray(nextAssets) ? nextAssets : [];
    } catch (error) {
      console.error("Impossible de charger le centre audio.", error);
      showToast?.(error?.message || "Impossible de charger le centre audio.", { isError:true });
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    if (!view) return;
    const assetMap = new Map(assets.map((asset) => [String(asset.audio_key || ""), asset]));
    const doneCount = registry.filter((entry) => assetMap.has(entry.key)).length;
    const totalCount = registry.length;
    const missingCount = Math.max(0, totalCount - doneCount);
    const categories = [...new Set(registry.map((entry) => String(entry.category || "Autres")))];
    const visible = registry.filter((entry) => {
      if (activeCategory !== "all" && entry.category !== activeCategory) return false;
      if (onlyMissing && assetMap.has(entry.key)) return false;
      return true;
    });

    view.innerHTML = `
      <div class="dashboard-audio-admin">
        <div class="dashboard-audio-admin-header">
          <div>
            <div class="dashboard-section-title">Centre audio</div>
            <div class="dashboard-audio-admin-summary">
              ${isLoading ? "Chargement…" : `${doneCount} / ${totalCount} audios enregistrés · ${missingCount} à faire`}
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
          <label class="dashboard-audio-admin-check">
            <input type="checkbox" data-audio-admin-only-missing ${onlyMissing ? "checked" : ""}>
            Seulement les audios manquants
          </label>
        </div>

        <div class="dashboard-audio-admin-list">
          ${isLoading && !registry.length ? `<div class="dashboard-activity-empty-state">Chargement du registre audio…</div>` : ""}
          ${!isLoading && !visible.length ? `<div class="dashboard-activity-empty-state">Aucun audio dans ce filtre.</div>` : ""}
          ${visible.map((entry) => renderEntry(entry, assetMap.get(entry.key) || null)).join("")}
        </div>
      </div>
    `;
    bind();
  }

  function renderEntry(entry, asset) {
    return `
      <article class="dashboard-audio-admin-row ${asset ? "is-recorded" : "is-missing"}" data-audio-key="${escapeAttr(entry.key)}">
        <div class="dashboard-audio-admin-state" title="${asset ? "Enregistré" : "À enregistrer"}">
          <span class="dashboard-material-icon" aria-hidden="true">${asset ? "check_circle" : "radio_button_unchecked"}</span>
        </div>
        <div class="dashboard-audio-admin-copy">
          <div class="dashboard-audio-admin-meta">
            <span class="dashboard-audio-admin-category">${escapeHtml(entry.category || "Autres")}</span>
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
          mimeType
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
    const assetMap = new Map(assets.map((asset) => [String(asset.audio_key || ""), asset]));
    const queue = registry.filter((entry) => !assetMap.has(entry.key));
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
    const ok = window.confirm(`Supprimer l’audio système « ${entry.label} » ? La synthèse vocale sera utilisée tant qu’il n’est pas réenregistré.`);
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
