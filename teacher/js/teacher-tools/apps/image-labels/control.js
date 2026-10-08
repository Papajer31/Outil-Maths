import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import { openToolAssetPicker } from "../../../../../shared/tool-assets/asset-picker.js";
import { loadTeacherResourceAssets } from "../../../../../shared/tool-assets/resource-assets.js";
import { prepareImageFilePayload, prepareImageResourcePayload } from "../image/source.js";
import { IMAGE_LABELS_MAX_IMAGES, applyImageLabelsAction, normalizeImageLabelsState } from "./model.js";
import { getImageLabelRendition } from "./renditions.js";

function layoutButtons(targetCount){
  return `
    <button class="tt-labels-layout-btn" type="button" data-image-labels-layout="align-left" title="Aligner les bords gauches" aria-label="Aligner les bords gauches" ${targetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_horizontal_left</span></button>
    <button class="tt-labels-layout-btn" type="button" data-image-labels-layout="align-center-x" title="Aligner les centres horizontalement" aria-label="Aligner les centres horizontalement" ${targetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_horizontal_center</span></button>
    <button class="tt-labels-layout-btn" type="button" data-image-labels-layout="align-right" title="Aligner les bords droits" aria-label="Aligner les bords droits" ${targetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_horizontal_right</span></button>
    <span class="tt-labels-layout-separator" aria-hidden="true"></span>
    <button class="tt-labels-layout-btn" type="button" data-image-labels-layout="align-top" title="Aligner les bords supérieurs" aria-label="Aligner les bords supérieurs" ${targetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_vertical_top</span></button>
    <button class="tt-labels-layout-btn" type="button" data-image-labels-layout="align-center-y" title="Aligner les centres verticalement" aria-label="Aligner les centres verticalement" ${targetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_vertical_center</span></button>
    <button class="tt-labels-layout-btn" type="button" data-image-labels-layout="align-bottom" title="Aligner les bords inférieurs" aria-label="Aligner les bords inférieurs" ${targetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_vertical_bottom</span></button>
    <span class="tt-labels-layout-separator" aria-hidden="true"></span>
    <button class="tt-labels-layout-btn" type="button" data-image-labels-layout="distribute-x" title="Répartir horizontalement" aria-label="Répartir horizontalement" ${targetCount >= 3 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">horizontal_distribute</span></button>
    <button class="tt-labels-layout-btn" type="button" data-image-labels-layout="distribute-y" title="Répartir verticalement" aria-label="Répartir verticalement" ${targetCount >= 3 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">vertical_distribute</span></button>`;
}

function renderList(state){
  const selected = new Set(state.selectedIds);
  return state.items.slice().sort((a,b) => b.z-a.z).map((item, index) => `
    <div class="tt-labels-object-row tt-image-labels-row${selected.has(item.id) ? " is-selected" : ""}${item.visible === false ? " is-hidden" : ""}" role="listitem" data-image-labels-row="${escapeAttr(item.id)}">
      <button class="tt-labels-object-select tt-image-labels-select" type="button" data-image-labels-select="${escapeAttr(item.id)}" aria-pressed="${selected.has(item.id)?"true":"false"}" title="${selected.has(item.id)?"Retirer de la sélection":"Ajouter à la sélection"}">
        <span class="tt-image-labels-thumb"><img alt="" loading="lazy" decoding="async" data-image-labels-thumb="${escapeAttr(item.id)}"></span>
        <span class="tt-labels-object-index">${index + 1}</span>
        <span class="tt-labels-object-text tt-image-labels-name">${escapeHtml(item.imageName || "Image")}</span>
      </button>
      <button class="tt-labels-object-visibility" type="button" data-image-labels-visible="${escapeAttr(item.id)}" aria-pressed="${item.visible !== false?"true":"false"}" title="${item.visible !== false?"Masquer":"Afficher"}"><span class="dashboard-material-icon">${item.visible !== false?"visibility":"visibility_off"}</span></button>
    </div>`).join("");
}

export function createImageLabelsControlPanel({
  host,
  getWidget,
  updateWidget,
  getTeacherSpace,
  listResourcesForSpace,
  listResourceFoldersForSpace,
  createResourceSignedUrl,
  showToast
} = {}){
  function state(){ return normalizeImageLabelsState(getWidget?.()?.state); }
  function commit(action, payload = {}, { renderAfter = true } = {}){
    const result = applyImageLabelsAction({ action, payload, state:state() });
    if (!result) return;
    if (result.error) { showToast?.(result.error, { isError:true }); return; }
    if (result.patch) updateWidget?.(result.patch, { renderPanel:renderAfter, sync:true });
    if (result.message) showToast?.(result.message, { isError:result.isError === true });
  }

  async function addFiles(files){
    const current = state();
    const remaining = IMAGE_LABELS_MAX_IMAGES-current.items.length;
    if (remaining <= 0) { showToast?.(`Limite : ${IMAGE_LABELS_MAX_IMAGES} images.`, { isError:true }); return; }
    const allFiles = Array.from(files || []);
    const chosen = allFiles.slice(0, remaining);
    if (!chosen.length) return;
    if (allFiles.length > chosen.length) showToast?.(`${IMAGE_LABELS_MAX_IMAGES} images maximum : ${allFiles.length - chosen.length} fichier${allFiles.length - chosen.length > 1 ? "s" : ""} ignoré${allFiles.length - chosen.length > 1 ? "s" : ""}.`);
    const images = [];
    for (const file of chosen) {
      try { images.push(await prepareImageFilePayload(file)); }
      catch (error) { showToast?.(`${file?.name || "Image"} : ${error?.message || "impossible à charger"}`, { isError:true }); }
    }
    if (images.length) commit("add-images", { images });
  }

  async function addResources(){
    const teacherSpaceId = Number(getTeacherSpace?.()?.id);
    if (!Number.isSafeInteger(teacherSpaceId) || teacherSpaceId <= 0) return;
    try {
      const picked = await openToolAssetPicker({
        type:"image",
        title:"Ajouter des images",
        multiple:true,
        confirmLabel:"Ajouter",
        loadAssets:() => loadTeacherResourceAssets({ teacherSpaceId, type:"image", listResourcesForSpace, listResourceFoldersForSpace, createResourceSignedUrl }),
        emptyMessage:"Aucune image disponible dans ce dossier."
      });
      if (!Array.isArray(picked) || !picked.length) return;
      const remaining = IMAGE_LABELS_MAX_IMAGES-state().items.length;
      if (remaining <= 0) { showToast?.(`Limite : ${IMAGE_LABELS_MAX_IMAGES} images.`, { isError:true }); return; }
      const accepted = picked.slice(0, remaining);
      if (picked.length > accepted.length) showToast?.(`${IMAGE_LABELS_MAX_IMAGES} images maximum : ${picked.length - accepted.length} sélection${picked.length - accepted.length > 1 ? "s" : ""} ignorée${picked.length - accepted.length > 1 ? "s" : ""}.`);
      const images = (await Promise.all(accepted.map((asset) => prepareImageResourcePayload(asset).catch(() => null)))).filter(Boolean);
      if (images.length) commit("add-images", { images });
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger les ressources.", { isError:true });
    }
  }

  function syncSelectionUi(){
    const current = state();
    const selected = new Set(current.selectedIds);
    host?.querySelectorAll?.("[data-image-labels-row]").forEach((row) => {
      const id = String(row.dataset.imageLabelsRow || "");
      row.classList.toggle("is-selected", selected.has(id));
      const button = row.querySelector("[data-image-labels-select]");
      if (button) button.setAttribute("aria-pressed", selected.has(id)?"true":"false");
    });
    const stats = host?.querySelector?.("[data-image-labels-stats]");
    const visibleCount = current.items.filter((item) => item.visible !== false).length;
    if (stats) stats.textContent = `${current.items.length}/${IMAGE_LABELS_MAX_IMAGES} · ${visibleCount} visible${visibleCount>1?"s":""} · ${current.selectedIds.length} sélectionnée${current.selectedIds.length>1?"s":""}`;
    const targetCount = current.selectedIds.length || visibleCount;
    host?.querySelectorAll?.("[data-image-labels-layout]").forEach((button) => { button.disabled = targetCount < (String(button.dataset.imageLabelsLayout||"").startsWith("distribute-") ? 3 : 2); });
    host?.querySelectorAll?.("[data-image-labels-z]").forEach((button) => { button.disabled = current.selectedIds.length === 0; });
  }

  function render(){
    if (!host) return;
    const current = state();
    const visible = current.items.filter((item) => item.visible !== false);
    const targetCount = current.selectedIds.length || visible.length;
    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-labels-control tt-image-labels-control" aria-label="Contrôles des étiquettes images">
        <div class="tt-control-panel-head">
          <div class="tt-labels-heading-row">
            <h3>Étiquettes Images</h3>
            <span class="tt-labels-count">${current.items.length} / ${IMAGE_LABELS_MAX_IMAGES} image${current.items.length > 1 ? "s" : ""} sur la scène</span>
          </div>
        </div>

        <div class="tt-widget-action-bar tt-labels-action-bar" aria-label="Actions des étiquettes images">
          <label class="tt-widget-action-btn is-primary tt-image-labels-file-btn">
            <span class="dashboard-material-icon" aria-hidden="true">upload_file</span>
            <span>Fichiers</span>
            <input type="file" accept="image/*" multiple data-image-labels-files>
          </label>
          <button class="tt-widget-action-btn" type="button" data-image-labels-resources>
            <span class="dashboard-material-icon" aria-hidden="true">photo_library</span>
            <span>Ressources</span>
          </button>
          <button class="tt-widget-action-btn is-danger" type="button" data-image-labels-clear ${current.items.length ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
            <span>Tout supprimer</span>
          </button>
        </div>

        <div class="tt-labels-layout-bar" aria-label="Disposition des images">
          <label class="tt-widget-action-toggle tt-labels-snap-toggle" title="Magnétisme d’alignement entre images">
            <input type="checkbox" data-image-labels-snap ${current.snapEnabled ? "checked" : ""}>
            <span class="tt-widget-action-toggle-track" aria-hidden="true"></span>
            <span>Magnétisme</span>
          </label>
          <span class="tt-labels-layout-separator" aria-hidden="true"></span>
          <span class="tt-labels-layout-target" title="Les commandes s’appliquent à la sélection active, ou à toutes les images visibles s’il n’y a aucune sélection.">${current.selectedIds.length ? `${current.selectedIds.length} sélectionnée${current.selectedIds.length > 1 ? "s" : ""}` : `${visible.length} visible${visible.length > 1 ? "s" : ""}`}</span>
          <span class="tt-labels-layout-separator" aria-hidden="true"></span>
          ${layoutButtons(targetCount)}
        </div>

        <div class="tt-labels-layout-bar tt-image-labels-depth-bar" aria-label="Profondeur des images">
          <span class="tt-labels-layout-target tt-image-labels-depth-label">Profondeur</span>
          <span class="tt-labels-layout-separator" aria-hidden="true"></span>
          <button class="tt-labels-layout-btn" type="button" data-image-labels-z="back" title="Arrière-plan" aria-label="Placer à l’arrière-plan" ${current.selectedIds.length ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">flip_to_back</span></button>
          <button class="tt-labels-layout-btn" type="button" data-image-labels-z="backward" title="Reculer" aria-label="Reculer" ${current.selectedIds.length ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">keyboard_arrow_down</span></button>
          <button class="tt-labels-layout-btn" type="button" data-image-labels-z="forward" title="Avancer" aria-label="Avancer" ${current.selectedIds.length ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">keyboard_arrow_up</span></button>
          <button class="tt-labels-layout-btn" type="button" data-image-labels-z="front" title="Premier plan" aria-label="Placer au premier plan" ${current.selectedIds.length ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">flip_to_front</span></button>
        </div>

        <section class="tt-labels-section tt-labels-objects-section tt-image-labels-list-section" aria-label="Images dans la projection">
          <div class="tt-labels-objects-head">
            <div class="tt-labels-section-title">
              <span class="dashboard-material-icon" aria-hidden="true">view_list</span>
              <span>Images dans la projection</span>
              <small data-image-labels-stats>${current.items.length}/${IMAGE_LABELS_MAX_IMAGES} · ${visible.length} visible${visible.length > 1 ? "s" : ""} · ${current.selectedIds.length} sélectionnée${current.selectedIds.length > 1 ? "s" : ""}</small>
            </div>
            <div class="tt-labels-objects-actions">
              <button class="tt-labels-mini-action" type="button" data-image-labels-select-all title="Sélectionner toutes les images visibles" ${visible.length ? "" : "disabled"}>
                <span class="dashboard-material-icon" aria-hidden="true">select_all</span><span>Tout sélectionner</span>
              </button>
              <button class="tt-labels-mini-action" type="button" data-image-labels-clear-selection title="Effacer la sélection" ${current.selectedIds.length ? "" : "disabled"}>
                <span class="dashboard-material-icon" aria-hidden="true">close</span><span>Désélectionner</span>
              </button>
            </div>
          </div>
          <div class="tt-labels-object-list tt-image-labels-list" role="list" aria-label="Images de la projection">${renderList(current) || '<div class="tt-labels-list-empty">Ajoute des images pour commencer.</div>'}</div>
        </section>
      </section>`;

    current.items.forEach((item) => {
      const image = host.querySelector(`[data-image-labels-thumb="${item.id.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`);
      if (!image) return;
      void getImageLabelRendition(item, 48, 40).then((source) => { if (image.isConnected && source) image.src = source; });
    });

    host.querySelector("[data-image-labels-files]")?.addEventListener("change", (event) => { void addFiles(event.currentTarget.files); event.currentTarget.value = ""; });
    host.querySelector("[data-image-labels-resources]")?.addEventListener("click", () => void addResources());
    host.querySelector("[data-image-labels-snap]")?.addEventListener("change", (event) => commit("set-snap-enabled", { enabled:event.currentTarget.checked }, { renderAfter:false }));
    host.querySelectorAll("[data-image-labels-layout]").forEach((button) => button.addEventListener("click", () => commit("layout", { command:button.dataset.imageLabelsLayout, itemIds:state().selectedIds })));
    host.querySelectorAll("[data-image-labels-z]").forEach((button) => button.addEventListener("click", () => commit("z-order", { command:button.dataset.imageLabelsZ, itemIds:state().selectedIds })));
    host.querySelectorAll("[data-image-labels-select]").forEach((button) => button.addEventListener("click", () => {
      const currentState = state(); const id = String(button.dataset.imageLabelsSelect || ""); const next = new Set(currentState.selectedIds); if (next.has(id)) next.delete(id); else next.add(id);
      commit("set-selection", { itemIds:[...next] }, { renderAfter:false });
      syncSelectionUi();
    }));
    host.querySelectorAll("[data-image-labels-visible]").forEach((button) => button.addEventListener("click", () => {
      const currentState = state(); const id = String(button.dataset.imageLabelsVisible || ""); const item = currentState.items.find((entry) => entry.id === id); if (!item) return;
      commit("set-visible", { itemId:id, visible:item.visible === false });
    }));
    host.querySelector("[data-image-labels-select-all]")?.addEventListener("click", () => { commit("set-selection", { itemIds:state().items.filter((item) => item.visible !== false).map((item) => item.id) }, { renderAfter:false }); syncSelectionUi(); });
    host.querySelector("[data-image-labels-clear-selection]")?.addEventListener("click", () => { commit("set-selection", { itemIds:[] }, { renderAfter:false }); syncSelectionUi(); });
    host.querySelector("[data-image-labels-clear]")?.addEventListener("click", () => commit("clear"));
  }

  render();
  return { render, destroy(){ if (host) host.innerHTML = ""; } };
}
