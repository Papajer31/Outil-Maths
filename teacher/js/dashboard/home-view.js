import { filterActivitySearchEntries } from "./activity-search.js";

/** Accueil enseignant : recherche et accès directs aux vues de travail. */
export function createTeacherHomeViewController({view, getActivitySearchEntries, onOpenSearchActivity, onOpenTableau, onCreateActivity, onOpenGenerators, onAssignActivity, showToast} = {}) {
  if (!view) return {render() {}};
  const shortcuts = [
    {action:"tableau", icon:"cast", title:"Ouvrir le Tableau", description:"Reprendre la dernière projection dans une fenêtre indépendante"},
    {action:"create", icon:"add_circle", title:"Créer une activité", description:"Créer un Quiz, une Série ou une activité avec outil"},
    {action:"generators", icon:"description", title:"Générateurs", description:"Accéder directement aux générateurs PDF"},
    {action:"assign", icon:"assignment", title:"Attribuer une activité", description:"Préparer une attribution aux élèves"}
  ];
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  view.innerHTML = `<div class="dashboard-home-content">
    <header class="dashboard-home-heading"><h2>QUE SOUHAITEZ-VOUS FAIRE ?</h2></header>
    <div class="dashboard-home-search">
      <label class="dashboard-home-search-field">
        <span class="dashboard-material-icon" aria-hidden="true">search</span>
        <input type="search" aria-label="Rechercher une activité" placeholder="Rechercher une activité…" autocomplete="off" aria-controls="homeActivitySearchResults">
      </label>
      <div class="dashboard-home-search-dropdown" hidden>
        <p class="dashboard-home-search-status" role="status" aria-live="polite" aria-atomic="true"></p>
        <div id="homeActivitySearchResults" class="dashboard-home-search-results"></div>
      </div>
    </div>
    <div class="dashboard-home-actions">${shortcuts.map(({action,icon,title,description}) => `
      <button class="dashboard-home-action" type="button" data-home-action="${action}">
        <span class="dashboard-home-action-icon dashboard-material-icon" aria-hidden="true">${icon}</span>
        <span class="dashboard-home-action-copy"><strong>${escape(title)}</strong><span>${escape(description)}</span></span>
        <span class="dashboard-home-action-arrow dashboard-material-icon" aria-hidden="true">arrow_forward</span>
      </button>`).join("")}</div>
  </div>`;
  const search = view.querySelector(".dashboard-home-search");
  const input = search.querySelector("input");
  const dropdown = search.querySelector(".dashboard-home-search-dropdown");
  const status = search.querySelector(".dashboard-home-search-status");
  const results = search.querySelector(".dashboard-home-search-results");
  let entries = [];
  let searchOpen = false;
  let loading = false;
  let loadError = false;
  let requestVersion = 0;
  let restoringFocus = false;

  function renderResults(){
    dropdown.hidden = !searchOpen;
    if (!searchOpen) return;
    if (loading || loadError) {
      status.textContent = loading ? "Chargement des activités…" : "Impossible de charger les activités. Réessayez en rouvrant la recherche.";
      results.innerHTML = "";
      return;
    }
    const matches = filterActivitySearchEntries(entries, input.value);
    status.textContent = matches.length ? `${matches.length} activité${matches.length > 1 ? "s" : ""} · Exploration et Mes activités` : (input.value.trim() ? "Aucune activité ne correspond à cette recherche." : "Aucune activité disponible.");
    results.scrollTop = 0;
    results.innerHTML = matches.map(({ activity, title, path, source = "exploration" }) => `
      <button class="exploration-search-result" type="button" data-home-search-id="${escape(activity.id)}" data-home-search-source="${escape(source)}">
        <span class="dashboard-material-icon" aria-hidden="true">extension</span>
        <span class="exploration-search-result-copy"><strong>${escape(title)}</strong><span>${escape(path)}</span></span>
        <span class="dashboard-material-icon" aria-hidden="true">arrow_forward</span>
      </button>
    `).join("");
  }

  async function openSearch(){
    if (searchOpen || restoringFocus) return;
    searchOpen = true;
    loading = true;
    loadError = false;
    const version = ++requestVersion;
    renderResults();
    try {
      const nextEntries = await getActivitySearchEntries?.() || [];
      if (version !== requestVersion) return;
      entries = nextEntries;
    } catch {
      if (version !== requestVersion) return;
      loadError = true;
    }
    if (version !== requestVersion) return;
    loading = false;
    renderResults();
  }

  function closeSearch({ restoreFocus = false } = {}){
    searchOpen = false;
    requestVersion++;
    dropdown.hidden = true;
    if (restoreFocus) {
      restoringFocus = true;
      input.focus({ preventScroll:true });
      restoringFocus = false;
    }
  }

  input.addEventListener("focus", openSearch);
  input.addEventListener("click", openSearch);
  input.addEventListener("input", () => {
    if (!searchOpen) void openSearch();
    else renderResults();
  });
  search.addEventListener("focusout", (event) => {
    if (!search.contains(event.relatedTarget)) closeSearch();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSearch({ restoreFocus:true });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!searchOpen) { void openSearch(); return; }
      const buttons = [...results.querySelectorAll("button")];
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (current + 1) % buttons.length : (current <= 0 ? buttons.length - 1 : current - 1);
      buttons[next]?.focus();
    }
  });
  results.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-home-search-id]");
    if (!button) return;
    const entry = entries.find(({ activity, source = "exploration" }) => String(activity.id) === button.dataset.homeSearchId && source === button.dataset.homeSearchSource);
    if (!entry) return;
    closeSearch();
    try { await onOpenSearchActivity?.(entry.activity, entry); }
    catch (error) { showToast?.(error?.message || "Impossible d’ouvrir l’activité.", { isError:true }); }
  });
  const closeOnOutsideClick = (event) => {
    if (!search.contains(event.target)) closeSearch();
  };
  document.addEventListener("pointerdown", closeOnOutsideClick);
  const handlers = {tableau:onOpenTableau, create:onCreateActivity, generators:onOpenGenerators, assign:onAssignActivity};
  view.addEventListener("click", (event) => {
    const button = event.target.closest("[data-home-action]");
    if (!button || !view.contains(button)) return;
    const handler = handlers[button.dataset.homeAction];
    if (typeof handler !== "function" || button.disabled) return;
    // Invocation synchrone pour préserver le geste utilisateur (fenêtre Tableau).
    try {
      const result = handler();
      if (result && typeof result.catch === "function") result.catch((error) => console.error("Raccourci Accueil impossible", error));
    } catch (error) { console.error("Raccourci Accueil impossible", error); }
  });
  return {
    render() {},
    closeSearch,
    destroy() {
      closeSearch();
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    }
  };
}
