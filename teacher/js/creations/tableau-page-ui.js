import { escapeAttr, escapeHtml } from "../dashboard/text-utils.js";
import { openDashboardNameDialog } from "../dashboard/name-overlay.js";

export function createTableauPageCreationUi({
  host,
  getWidget,
  updateWidget,
  getTeacherSpace,
  getResolvedPageBackground,
  listResourcesForSpace,
  showToast,
  type,
  toolId,
  label,
  icon = "deployed_code"
} = {}){
  const creationType = String(type || "").trim();
  const expectedToolId = String(toolId || "").trim();
  const defaultLabel = String(label || "Création Tableau").trim() || "Création Tableau";
  const defaultIcon = String(icon || "deployed_code").trim() || "deployed_code";
  let saving = false;
  let disposed = false;
  const dialogs = new Set();

  function getLink(){
    const raw = getWidget?.()?.creation;
    if (!raw || typeof raw !== "object") return null;
    const resourceId = String(raw.resourceId || "").trim();
    if (!resourceId || String(raw.type || "").trim() !== creationType) return null;
    return { resourceId, type:creationType, title:String(raw.title || "").trim() };
  }

  function setBusy(value){
    saving = Boolean(value);
    if (disposed) return;
    host?.querySelectorAll?.("[data-page-creation-action]").forEach((button) => { button.disabled = saving; });
  }

  async function save({ title, resourceId = "" } = {}){
    if (saving || disposed) return null;
    const teacherSpaceId = String(getTeacherSpace?.()?.id || "").trim();
    if (!teacherSpaceId) throw new Error("Espace enseignant introuvable.");
    const page = getWidget?.();
    if (!page || String(page.toolId || "") !== expectedToolId) throw new Error(`Page ${defaultLabel} introuvable.`);
    const resolvedBackground = getResolvedPageBackground?.() || page.surface?.background || null;
    setBusy(true);
    try {
      const { saveTujerCreation } = await import("./service.js");
      const result = await saveTujerCreation({
        teacherSpaceId,
        type:creationType,
        title,
        resourceId,
        context:{
          page,
          resolvedBackground
        }
      });
      const savedResourceId = String(result?.resource?.id || "").trim();
      const savedTitle = String(result?.document?.title || result?.resource?.title || title || defaultLabel).trim();
      if (!savedResourceId) throw new Error("La création n’a pas pu être enregistrée.");
      updateWidget?.({ creation:{ resourceId:savedResourceId, type:creationType, title:savedTitle } }, { renderPanel:true, sync:false });
      showToast?.(`« ${savedTitle} » enregistré dans Mes créations.`);
      return result;
    } finally {
      setBusy(false);
    }
  }

  function openSaveDialog({ copy = false } = {}){
    const linked = getLink();
    const baseTitle = linked?.title || defaultLabel;
    openDashboardNameDialog({
      title:copy ? "Enregistrer une copie" : "Enregistrer dans mes créations",
      initialValue:copy && linked?.title ? `${linked.title} - copie` : baseTitle,
      placeholder:"Nom de la création",
      confirmLabel:"Enregistrer",
      onConfirm:(title) => save({ title, resourceId:copy ? "" : (linked?.resourceId || "") })
    });
  }

  async function openPicker(){
    if (saving || disposed) return;
    const teacherSpaceId = String(getTeacherSpace?.()?.id || "").trim();
    if (!teacherSpaceId || typeof listResourcesForSpace !== "function") {
      showToast?.("Mes ressources est indisponible.", { isError:true });
      return;
    }
    let resources = [];
    try {
      resources = (await listResourcesForSpace(teacherSpaceId)).filter((resource) =>
        resource?.is_system !== true
        && String(resource?.type || "") === "creation"
        && String(resource?.metadata?.tujer_creation?.type || "") === creationType
      );
    } catch (error) {
      showToast?.(error?.message || "Impossible de lire Mes créations.", { isError:true });
      return;
    }
    if (disposed) return;

    const dialog = document.createElement("dialog");
    dialog.className = "tt-labels-creation-picker";
    const renderItems = (query = "") => {
      const needle = String(query || "").trim().toLocaleLowerCase("fr-FR");
      const filtered = resources
        .filter((resource) => !needle || String(resource?.title || "").toLocaleLowerCase("fr-FR").includes(needle))
        .sort((a, b) => String(a?.title || "").localeCompare(String(b?.title || ""), "fr", { sensitivity:"base", numeric:true }));
      return filtered.length ? filtered.map((resource) => `
        <button type="button" class="tt-labels-creation-picker-item" data-page-open-creation="${escapeAttr(resource.id)}">
          <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(resource?.metadata?.tujer_creation?.icon || defaultIcon)}</span>
          <span><strong>${escapeHtml(resource.title || defaultLabel)}</strong><small>${escapeHtml(resource.updated_at ? new Date(resource.updated_at).toLocaleString("fr-FR", { dateStyle:"short", timeStyle:"short" }) : "")}</small></span>
        </button>`).join("") : `<div class="tt-labels-creation-picker-empty">Aucune création ${escapeHtml(defaultLabel)}${needle ? " correspondante" : " enregistrée"}.</div>`;
    };
    dialog.innerHTML = `
      <div class="tt-labels-creation-picker-card">
        <div class="tt-labels-creation-picker-head">
          <div><strong>Mes créations — ${escapeHtml(defaultLabel)}</strong><small>La création choisie remplacera le contenu de cette page.</small></div>
          <button type="button" class="dashboard-icon-btn dashboard-material-icon-btn" data-page-picker-close aria-label="Fermer"><span class="dashboard-material-icon">close</span></button>
        </div>
        <label class="tt-labels-creation-picker-search"><span class="dashboard-material-icon" aria-hidden="true">search</span><input type="search" placeholder="Rechercher…" data-page-picker-search></label>
        <div class="tt-labels-creation-picker-list" data-page-picker-list>${renderItems()}</div>
      </div>`;
    document.body.appendChild(dialog);
    dialogs.add(dialog);
    const list = dialog.querySelector("[data-page-picker-list]");
    const search = dialog.querySelector("[data-page-picker-search]");
    const close = () => dialog.close();
    dialog.querySelectorAll("[data-page-picker-close]").forEach((button) => button.addEventListener("click", close));
    search?.addEventListener("input", () => { if (list) list.innerHTML = renderItems(search.value); });
    dialog.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page-open-creation]");
      if (!button) return;
      const resource = resources.find((item) => String(item.id) === String(button.dataset.pageOpenCreation));
      if (!resource) return;
      button.disabled = true;
      void import("./service.js").then(({ loadTujerCreation }) => loadTujerCreation({ teacherSpaceId, resource, hydrate:true })).then((loaded) => {
        if (disposed) return;
        const page = loaded?.payload?.page;
        if (!page || String(page.toolId || "") !== expectedToolId) throw new Error(`Cette création n’est pas une page ${defaultLabel}.`);
        updateWidget?.({
          label:String(page.label || defaultLabel),
          icon:String(page.icon || defaultIcon),
          state:page.state,
          surface:page.surface,
          creation:{ resourceId:String(resource.id), type:creationType, title:String(loaded?.document?.title || resource.title || defaultLabel) }
        }, { renderPanel:true, sync:true });
        showToast?.(`« ${loaded?.document?.title || resource.title || defaultLabel} » ouverte.`);
        close();
      }).catch((error) => {
        button.disabled = false;
        showToast?.(error?.message || "Ouverture impossible.", { isError:true });
      });
    });
    dialog.addEventListener("close", () => { dialogs.delete(dialog); dialog.remove(); }, { once:true });
    dialog.showModal?.();
    requestAnimationFrame(() => search?.focus());
  }

  function renderButtons(){
    const linked = getLink();
    const actions = linked ? [
      { action:"update", icon:"save", label:"Mettre à jour", primary:true, title:`Mettre à jour « ${linked.title || defaultLabel} »` },
      { action:"copy", icon:"folder_copy", label:"Enregistrer une copie" }
    ] : [
      { action:"save", icon:"save", label:"Enregistrer dans mes créations", primary:true }
    ];
    actions.push({ action:"open", icon:"folder_open", label:"Ouvrir une création" });
    return actions.map((item) => `<button class="tt-board-action-btn${item.primary ? " is-primary" : ""}" type="button" data-page-creation-action="${item.action}" aria-label="${escapeAttr(item.label)}" title="${escapeAttr(item.title || item.label)}" ${saving ? "disabled" : ""}><span class="dashboard-material-icon" aria-hidden="true">${item.icon}</span></button>`).join("");
  }

  function bind(){
    host?.querySelector?.('[data-page-creation-action="save"]')?.addEventListener("click", () => openSaveDialog());
    host?.querySelector?.('[data-page-creation-action="copy"]')?.addEventListener("click", () => openSaveDialog({ copy:true }));
    host?.querySelector?.('[data-page-creation-action="open"]')?.addEventListener("click", () => { void openPicker(); });
    host?.querySelector?.('[data-page-creation-action="update"]')?.addEventListener("click", () => {
      const linked = getLink();
      if (!linked || saving) return;
      void save({ title:linked.title || defaultLabel, resourceId:linked.resourceId }).catch((error) => showToast?.(error?.message || "Enregistrement impossible.", { isError:true }));
    });
  }

  function render(nextHost = host){
    host = nextHost;
    if (!host || disposed) return;
    host.innerHTML = renderButtons();
    bind();
  }

  function destroy(){
    disposed = true;
    for (const dialog of dialogs) { dialog.close?.(); dialog.remove(); }
    dialogs.clear();
    host?.replaceChildren();
  }

  return { getLink, render, save, openPicker, destroy };
}
