import {
  SEYES_FONTS,
  SEYES_RULINGS,
  SEYES_SCALE_MAX,
  SEYES_SCALE_MIN,
  SEYES_SCALE_STEP,
  applySeyesAction,
  normalizeSeyesState
} from "./model.js";
import {
  SEYES_DOCUMENT_MIME,
  createSeyesFile,
  downloadSeyesDocument,
  parseSeyesDocumentText,
  plainTextToSeyesHtml,
  readSeyesDocumentFile
} from "./document.js";
import { openSeyesPdfExportDialog } from "./pdf-export.js";

function escapeHtml(value){ return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function formatScale(value){ return `${Math.round((Number(value) || 1) * 100)} %`; }
function alignmentMeta(value){
  if (value === "center") return { icon:"format_align_center", label:"Centré", next:"right" };
  if (value === "right") return { icon:"format_align_right", label:"À droite", next:"left" };
  return { icon:"format_align_left", label:"À gauche", next:"center" };
}
function renderRulingTiles(state){
  return SEYES_RULINGS.map((item) => `<button class="tt-seyes-ruling-tile${state.ruling === item.id ? " is-selected" : ""}" type="button" data-seyes-ruling="${item.id}" aria-pressed="${state.ruling === item.id}"><span class="tt-seyes-ruling-preview is-${item.id}" aria-hidden="true"></span><span>${escapeHtml(item.label)}</span></button>`).join("");
}

function openPasteDialog(onSubmit){
  const dialog = document.createElement("dialog");
  dialog.className = "tt-seyes-dialog";
  dialog.innerHTML = `<form method="dialog" class="tt-seyes-dialog-card"><div class="tt-seyes-dialog-head"><strong>Coller du texte brut</strong><button type="button" data-close>×</button></div><textarea class="tt-seyes-paste-text" rows="11" spellcheck="false" placeholder="Colle le texte ici…"></textarea><div class="tt-seyes-dialog-actions"><button type="button" data-close>Annuler</button><button type="button" class="is-primary" data-insert>Insérer</button></div></form>`;
  document.body.appendChild(dialog);
  dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[data-insert]")?.addEventListener("click", () => { onSubmit?.(dialog.querySelector("textarea")?.value || ""); dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove(), { once:true });
  dialog.showModal?.(); dialog.querySelector("textarea")?.focus();
}

async function openResourcePicker({ resources, createResourceSignedUrl, onOpen, showToast } = {}){
  const items = (Array.isArray(resources) ? resources : []).filter((resource) => resource?.type === "seyes" && resource?.is_system !== true);
  const dialog = document.createElement("dialog");
  dialog.className = "tt-seyes-dialog tt-seyes-resource-dialog";
  dialog.innerHTML = `<div class="tt-seyes-dialog-card"><div class="tt-seyes-dialog-head"><strong>Documents Seyès — Mes ressources</strong><button type="button" data-close>×</button></div><div class="tt-seyes-resource-list">${items.length ? items.map((item) => `<button type="button" data-resource-id="${escapeHtml(item.id)}"><span class="dashboard-material-icon">edit_note</span><span><strong>${escapeHtml(item.title || "Document Seyès")}</strong><small>${escapeHtml(item.updated_at ? new Date(item.updated_at).toLocaleDateString("fr-FR") : "")}</small></span></button>`).join("") : `<div class="tt-seyes-empty">Aucun document Seyès enregistré.</div>`}</div><div class="tt-seyes-dialog-actions"><button type="button" data-close>Fermer</button></div></div>`;
  document.body.appendChild(dialog);
  dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelectorAll("[data-resource-id]").forEach((button) => button.addEventListener("click", async () => {
    const resource = items.find((item) => String(item.id) === String(button.dataset.resourceId));
    if (!resource) return;
    button.disabled = true;
    try {
      const url = resource.url || await createResourceSignedUrl?.(resource, 3600);
      if (!url) throw new Error("Document indisponible.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Impossible de télécharger ce document.");
      const state = parseSeyesDocumentText(await response.text(), { filename: resource.title || "document.seyes" });
      onOpen?.(state); dialog.close();
    } catch (error) { showToast?.(error?.message || "Ouverture impossible.", { isError:true }); button.disabled = false; }
  }));
  dialog.addEventListener("close", () => dialog.remove(), { once:true });
  dialog.showModal?.();
}

export function createSeyesControlPanel({
  host,
  getWidget,
  updateWidget,
  getTeacherSpace,
  listResourcesForSpace,
  uploadResourceForSpace,
  createResourceSignedUrl,
  showToast
} = {}){
  let letterOpen = false;
  let wordOpen = false;
  let resetArmed = false;
  let resetTimer = null;

  function getState(){ return normalizeSeyesState(getWidget?.()?.state); }
  function commit(action, payload = {}, { renderPanel = true } = {}){
    const result = applySeyesAction({ action, payload, state:getState() });
    if (!result) return;
    if (result.error) { showToast?.(String(result.error), { isError:true }); return; }
    if (result.patch) updateWidget?.(result.patch, { renderPanel, sync:true });
    if (result.message) showToast?.(result.message, { isError:result.isError === true });
  }
  function armReset(){
    if (resetArmed) { resetArmed = false; clearTimeout(resetTimer); commit("reset-document"); return; }
    resetArmed = true; render();
    clearTimeout(resetTimer); resetTimer = setTimeout(() => { resetArmed = false; render(); }, 3500);
  }
  async function saveResource(){
    const spaceId = Number(getTeacherSpace?.()?.id);
    if (!Number.isSafeInteger(spaceId) || spaceId <= 0 || typeof uploadResourceForSpace !== "function") { showToast?.("Mes ressources est indisponible.", { isError:true }); return; }
    try {
      const state = getState();
      const file = createSeyesFile(state);
      await uploadResourceForSpace(spaceId, file, {
        type:"seyes",
        title:state.title,
        mime_type:SEYES_DOCUMENT_MIME,
        alt:state.title,
        metadata:{ resource_type:"seyes", schema_version:1 }
      });
      showToast?.(`« ${state.title} » enregistré dans Mes ressources.`);
    } catch (error) { showToast?.(error?.message || "Sauvegarde impossible.", { isError:true }); }
  }
  async function openFromResources(){
    const spaceId = Number(getTeacherSpace?.()?.id);
    if (!Number.isSafeInteger(spaceId) || spaceId <= 0 || typeof listResourcesForSpace !== "function") { showToast?.("Mes ressources est indisponible.", { isError:true }); return; }
    try {
      const resources = await listResourcesForSpace(spaceId);
      await openResourcePicker({ resources, createResourceSignedUrl, showToast, onOpen:(state) => commit("load-document", { state }) });
    } catch (error) { showToast?.(error?.message || "Impossible de lire Mes ressources.", { isError:true }); }
  }

  function render(){
    if (!host) return;
    const state = getState();
    const align = alignmentMeta(state.alignment);
    host.innerHTML = `
      <section class="tt-control-panel tt-seyes-control" aria-label="Configuration de Seyès">
        <div class="tt-seyes-main-grid">
          <section class="tt-seyes-card">
            <div class="tt-seyes-card-title"><span class="dashboard-material-icon">text_snippet</span><strong>Document</strong></div>
            <label class="tt-seyes-title-field"><span>Nom</span><input type="text" data-seyes-title maxlength="120" value="${escapeHtml(state.title)}" spellcheck="false"></label>
            <div class="tt-seyes-actions">
              <button type="button" data-reset class="${resetArmed ? "is-danger" : ""}"><span class="dashboard-material-icon">restart_alt</span><span>${resetArmed ? "Confirmer" : "Nouveau"}</span></button>
              <button type="button" data-save-resource><span class="dashboard-material-icon">save</span><span>Mes ressources</span></button>
              <button type="button" data-save-local><span class="dashboard-material-icon">download</span><span>Fichier .seyes</span></button>
              <button type="button" data-open-resource><span class="dashboard-material-icon">folder_open</span><span>Mes ressources</span></button>
              <label class="tt-seyes-file-button"><span class="dashboard-material-icon">upload_file</span><span>Ouvrir un fichier</span><input type="file" data-open-local accept=".seyes,.txt,text/plain,application/vnd.site-outils.seyes+json"></label>
              <button type="button" data-paste><span class="dashboard-material-icon">content_paste</span><span>Coller du texte</span></button>
              <button type="button" data-pdf><span class="dashboard-material-icon">text_snippet</span><span>Exporter PDF</span></button>
            </div>
          </section>
          <section class="tt-seyes-card">
            <div class="tt-seyes-card-title"><span class="dashboard-material-icon">text_fields</span><strong>Écriture</strong></div>
            <div class="tt-seyes-settings-row">
              <label><span>Police</span><select data-font>${SEYES_FONTS.map((font) => `<option value="${font.id}" ${font.id === state.fontId ? "selected" : ""}>${escapeHtml(font.label)}</option>`).join("")}</select></label>
              <button type="button" data-align title="Changer l’alignement"><span class="dashboard-material-icon">${align.icon}</span><span>${align.label}</span></button>
            </div>
            <label class="tt-seyes-range-field"><span>Échelle <b>${formatScale(state.scale)}</b></span><input type="range" data-scale min="${SEYES_SCALE_MIN}" max="${SEYES_SCALE_MAX}" step="${SEYES_SCALE_STEP}" value="${state.scale}"></label>
            <div class="tt-seyes-ruling-grid">${renderRulingTiles(state)}</div>
            <div class="tt-seyes-actions is-compact">
              <div class="tt-seyes-popover-anchor"><button type="button" data-letter-toggle class="${letterOpen ? "is-active" : ""}">Espacement lettres</button>${letterOpen ? `<div class="tt-seyes-mini-popover"><input type="range" data-letter min="-0.04" max="0.24" step="0.01" value="${state.letterSpacing}"><b>${Math.round(state.letterSpacing*100)} %</b></div>` : ""}</div>
              <div class="tt-seyes-popover-anchor"><button type="button" data-word-toggle class="${wordOpen ? "is-active" : ""}">Espacement mots</button>${wordOpen ? `<div class="tt-seyes-mini-popover"><input type="range" data-word min="-0.04" max="0.7" step="0.02" value="${state.wordSpacing}"><b>${Math.round(state.wordSpacing*100)} %</b></div>` : ""}</div>
            </div>
          </section>
        </div>
        <p class="tt-seyes-help">Le texte et sa mise en forme s’éditent directement dans la projection. Le correcteur orthographique du navigateur est désactivé.</p>
      </section>`;

    host.querySelector("[data-reset]")?.addEventListener("click", armReset);
    const titleInput = host.querySelector("[data-seyes-title]");
    titleInput?.addEventListener("change", () => commit("set-settings", { title:titleInput.value }));
    host.querySelector("[data-save-resource]")?.addEventListener("click", saveResource);
    host.querySelector("[data-save-local]")?.addEventListener("click", () => downloadSeyesDocument(getState()));
    host.querySelector("[data-open-resource]")?.addEventListener("click", openFromResources);
    host.querySelector("[data-open-local]")?.addEventListener("change", async (event) => {
      const file = event.currentTarget.files?.[0]; if (!file) return;
      try { commit("load-document", { state:await readSeyesDocumentFile(file) }); }
      catch (error) { showToast?.(error?.message || "Ouverture impossible.", { isError:true }); }
      event.currentTarget.value = "";
    });
    host.querySelector("[data-paste]")?.addEventListener("click", () => openPasteDialog((text) => commit("set-content", { contentHtml:plainTextToSeyesHtml(text) })));
    host.querySelector("[data-pdf]")?.addEventListener("click", () => openSeyesPdfExportDialog({ state:getState(), showToast }));
    host.querySelector("[data-font]")?.addEventListener("change", (event) => commit("set-settings", { fontId:event.currentTarget.value }));
    host.querySelector("[data-align]")?.addEventListener("click", () => commit("set-settings", { alignment:align.next }));
    const scale = host.querySelector("[data-scale]");
    scale?.addEventListener("input", () => { const b = scale.closest("label")?.querySelector("b"); if (b) b.textContent = formatScale(scale.value); });
    scale?.addEventListener("change", () => commit("set-settings", { scale:Number(scale.value) }));
    host.querySelectorAll("[data-seyes-ruling]").forEach((button) => button.addEventListener("click", () => commit("set-settings", { ruling:button.dataset.seyesRuling })));
    host.querySelector("[data-letter-toggle]")?.addEventListener("click", () => { letterOpen=!letterOpen; wordOpen=false; render(); });
    host.querySelector("[data-word-toggle]")?.addEventListener("click", () => { wordOpen=!wordOpen; letterOpen=false; render(); });
    const letter = host.querySelector("[data-letter]");
    letter?.addEventListener("input", () => { const b = letter.parentElement?.querySelector("b"); if (b) b.textContent = `${Math.round(Number(letter.value)*100)} %`; });
    letter?.addEventListener("change", () => commit("set-settings", { letterSpacing:Number(letter.value) }));
    const word = host.querySelector("[data-word]");
    word?.addEventListener("input", () => { const b = word.parentElement?.querySelector("b"); if (b) b.textContent = `${Math.round(Number(word.value)*100)} %`; });
    word?.addEventListener("change", () => commit("set-settings", { wordSpacing:Number(word.value) }));
  }

  render();
  return { render, destroy(){ clearTimeout(resetTimer); if (host) host.innerHTML=""; } };
}
