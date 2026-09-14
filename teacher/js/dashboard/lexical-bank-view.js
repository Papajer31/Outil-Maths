import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";
import { getPhonologyWordCgpComplexity } from "../../../shared/phonology-word-level.js";

const XLSX_HEADERS = [
  "entrée",
  "catégorie",
  "niveau_lexical",
  "phono",
  "syllabes",
  "introducteurs",
  "masc_sing",
  "fem_sing",
  "masc_plur",
  "fem_plur"
];

const LEVELS = [1, 2, 3];
const DEFAULT_CATEGORIES = [
  "nom", "adjectif", "verbe", "adverbe", "pronom", "déterminant",
  "préposition", "conjonction", "interjection", "autre"
];

function normalizeText(value){
  return String(value ?? "").trim().normalize("NFC");
}

function normalizeEntryKey(value){
  return normalizeText(value).toLocaleLowerCase("fr-FR");
}

function splitCell(value){
  return normalizeText(value)
    .split(";")
    .map((item) => item.trim().normalize("NFC"))
    .filter(Boolean);
}

function joinCell(value){
  return (Array.isArray(value) ? value : []).map(normalizeText).filter(Boolean).join(";");
}

function cleanNullable(value){
  return normalizeText(value) || null;
}

function normalizeLexicalLevel(value){
  const level = Number(value);
  return Number.isInteger(level) && LEVELS.includes(level) ? level : 0;
}

function normalizeEntry(row = {}){
  return {
    id: row.id ? String(row.id) : null,
    entry_key: normalizeEntryKey(row.entry_key || row.entry),
    entry: normalizeText(row.entry),
    category: normalizeText(row.category).toLocaleLowerCase("fr-FR"),
    lexical_level: normalizeLexicalLevel(row.lexical_level),
    phonology: Array.isArray(row.phonology) ? row.phonology.map(normalizeText).filter(Boolean) : splitCell(row.phono),
    syllabifications: Array.isArray(row.syllabifications) ? row.syllabifications.map(normalizeText).filter(Boolean) : splitCell(row.syllabes),
    introducers: Array.isArray(row.introducers) ? row.introducers.map(normalizeText).filter(Boolean) : splitCell(row.introducteurs),
    masc_sing: cleanNullable(row.masc_sing),
    fem_sing: cleanNullable(row.fem_sing),
    masc_plur: cleanNullable(row.masc_plur),
    fem_plur: cleanNullable(row.fem_plur),
    is_active: row.is_active !== false,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || row.created_at || "")
  };
}

function comparableEntry(row = {}){
  const item = normalizeEntry(row);
  return JSON.stringify({
    entry:item.entry,
    category:item.category,
    lexical_level:item.lexical_level,
    phonology:item.phonology,
    syllabifications:item.syllabifications,
    introducers:item.introducers,
    masc_sing:item.masc_sing,
    fem_sing:item.fem_sing,
    masc_plur:item.masc_plur,
    fem_plur:item.fem_plur,
    is_active:item.is_active
  });
}

function getXlsx(){
  const api = globalThis.XLSX;
  if (!api?.read || !api?.utils?.sheet_to_json) {
    throw new Error("Le module XLSX n’est pas disponible. Recharge la page puis réessaie.");
  }
  return api;
}

async function readWorkbookRows(file){
  const XLSX = getXlsx();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type:"array", cellDates:false });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) throw new Error("Le classeur ne contient aucune feuille.");
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header:1,
    raw:false,
    defval:""
  });
  if (!Array.isArray(matrix) || !matrix.length) throw new Error("La première feuille est vide.");

  const headers = matrix[0].map((value) => normalizeText(value).toLocaleLowerCase("fr-FR"));
  const indexes = new Map(headers.map((header, index) => [header, index]));
  const missingHeaders = XLSX_HEADERS.filter((header) => !indexes.has(header));
  if (missingHeaders.length) {
    throw new Error(`Colonnes manquantes : ${missingHeaders.join(", ")}.`);
  }

  const rows = [];
  const errors = [];
  const seenKeys = new Set();
  matrix.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (header) => cells[indexes.get(header)] ?? "";
    const entry = normalizeText(get("entrée"));
    const hasAnyValue = XLSX_HEADERS.some((header) => normalizeText(get(header)) !== "");
    if (!hasAnyValue) return;
    if (!entry) {
      errors.push(`Ligne ${line} : entrée vide.`);
      return;
    }
    const category = normalizeText(get("catégorie")).toLocaleLowerCase("fr-FR");
    const lexicalLevel = normalizeLexicalLevel(get("niveau_lexical"));
    if (!category) errors.push(`Ligne ${line} (${entry}) : catégorie vide.`);
    if (!LEVELS.includes(lexicalLevel)) errors.push(`Ligne ${line} (${entry}) : niveau lexical invalide.`);
    const entryKey = normalizeEntryKey(entry);
    if (seenKeys.has(entryKey)) errors.push(`Ligne ${line} (${entry}) : entrée en double dans le classeur.`);
    seenKeys.add(entryKey);
    rows.push(normalizeEntry({
      entry,
      category,
      lexical_level:lexicalLevel,
      phono:get("phono"),
      syllabes:get("syllabes"),
      introducteurs:get("introducteurs"),
      masc_sing:get("masc_sing"),
      fem_sing:get("fem_sing"),
      masc_plur:get("masc_plur"),
      fem_plur:get("fem_plur")
    }));
  });
  if (!rows.length && !errors.length) errors.push("Aucune entrée à importer.");
  return { rows, errors };
}

function renderVariantSummary(entry){
  const variants = [entry.masc_sing, entry.fem_sing, entry.masc_plur, entry.fem_plur]
    .map(normalizeText)
    .filter(Boolean);
  return Array.from(new Set(variants)).join(" · ");
}

function getLexicalEntryCgpComplexity(entry){
  const analyses = Array.isArray(entry?.phonology) ? entry.phonology : [];
  if (!analyses.length) return 5;
  return analyses.reduce((highest, analysis) => {
    const units = normalizeText(analysis)
      .split("/")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => ({
        graph: token.replace(/^\*+/, ""),
        isSilent: token.startsWith("*")
      }));
    return Math.max(highest, getPhonologyWordCgpComplexity({ units }));
  }, 1);
}

function compareText(left, right){
  return normalizeText(left).localeCompare(normalizeText(right), "fr", { sensitivity:"base", numeric:true });
}

const LEXICAL_LEVEL_RANK = Object.freeze({ 1:1, 2:2, 3:3 });

function getSortValue(entry, key){
  switch (key) {
    case "category": return entry.category;
    case "level": return LEXICAL_LEVEL_RANK[entry.lexical_level] || 99;
    case "cgp": return getLexicalEntryCgpComplexity(entry);
    case "phonology": return joinCell(entry.phonology);
    case "syllables": return joinCell(entry.syllabifications);
    case "variants": return renderVariantSummary(entry);
    case "entry":
    default: return entry.entry;
  }
}

function compareSortValues(left, right){
  if (typeof left === "number" && typeof right === "number") return left - right;
  return compareText(left, right);
}

function formatCount(value){
  return new Intl.NumberFormat("fr-FR").format(Math.max(0, Number(value) || 0));
}

export function createLexicalBankViewController({
  view,
  host,
  getIsSuperAdmin,
  listLexicalEntries,
  saveLexicalEntryAsAdmin,
  deleteLexicalEntryAsAdmin,
  upsertLexicalEntriesAsAdmin,
  showToast,
  onBack,
  onChanged
} = {}){
  let entries = [];
  let isLoading = false;
  let loadError = "";
  let search = "";
  let levelFilter = "";
  let categoryFilter = "";
  let sortKey = "entry";
  let sortDirection = "asc";
  let isOpen = false;
  let pendingImport = false;

  function isAdmin(){
    return getIsSuperAdmin?.() === true;
  }

  function getTitleElement(){
    return view?.querySelector?.(".dashboard-section-title") || null;
  }

  function setOpenState(nextOpen){
    isOpen = nextOpen === true;
    view?.classList.toggle("is-lexical-bank-open", isOpen);
    const title = getTitleElement();
    if (title) title.textContent = isOpen ? "Mots" : "Ressources";
  }

  async function reload(){
    if (typeof listLexicalEntries !== "function") return;
    isLoading = true;
    loadError = "";
    render();
    try {
      entries = (await listLexicalEntries()).map(normalizeEntry);
    } catch (error) {
      console.error("Impossible de charger la banque lexicale.", error);
      loadError = error?.message || "Impossible de charger la banque lexicale.";
    } finally {
      isLoading = false;
      render();
    }
  }

  function getCategories(){
    return Array.from(new Set(entries.map((entry) => entry.category).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity:"base" }));
  }

  function getFilteredEntries(){
    const needle = search.trim().toLocaleLowerCase("fr-FR");
    return entries
      .filter((entry) => !levelFilter || entry.lexical_level === levelFilter)
      .filter((entry) => !categoryFilter || entry.category === categoryFilter)
      .filter((entry) => {
        if (!needle) return true;
        return [
          entry.entry,
          entry.category,
          entry.lexical_level,
          joinCell(entry.phonology),
          joinCell(entry.syllabifications),
          joinCell(entry.introducers),
          entry.masc_sing,
          entry.fem_sing,
          entry.masc_plur,
          entry.fem_plur
        ].some((value) => normalizeText(value).toLocaleLowerCase("fr-FR").includes(needle));
      })
      .sort((a, b) => {
        const direction = sortDirection === "desc" ? -1 : 1;
        const primary = compareSortValues(getSortValue(a, sortKey), getSortValue(b, sortKey));
        if (primary !== 0) return primary * direction;
        return compareText(a.entry, b.entry);
      });
  }

  function renderSortHeader(label, key, { title = "" } = {}){
    const active = sortKey === key;
    const ariaSort = active ? (sortDirection === "asc" ? "ascending" : "descending") : "none";
    const nextLabel = active && sortDirection === "asc" ? "décroissant" : "croissant";
    return `
      <th scope="col" aria-sort="${ariaSort}" class="dashboard-lexical-sort-th ${active ? "is-sorted" : ""}" ${title ? `title="${escapeAttr(title)}"` : ""}>
        <button type="button" class="dashboard-lexical-sort-button" data-lexical-sort="${escapeAttr(key)}" aria-label="Trier ${escapeAttr(label)} par ordre ${nextLabel}">
          <span>${escapeHtml(label)}</span>
          <span class="dashboard-lexical-sort-indicator" aria-hidden="true">${active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    `;
  }

  function renderToolbar(){
    const categories = getCategories();
    return `
      <div class="dashboard-lexical-toolbar">
        <div class="dashboard-lexical-toolbar-main">
          <button class="btn dashboard-btn-with-icon" type="button" data-lexical-action="back">
            <span class="dashboard-material-icon" aria-hidden="true">arrow_back</span>
            <span>Ressources</span>
          </button>
          <label class="dashboard-lexical-search">
            <span class="dashboard-material-icon" aria-hidden="true">search</span>
            <input type="search" data-lexical-search value="${escapeAttr(search)}" placeholder="Rechercher un mot…" autocomplete="off">
          </label>
          <select class="dashboard-lexical-filter" data-lexical-level aria-label="Filtrer par niveau lexical">
            <option value="">Tous les niveaux</option>
            ${LEVELS.map((level) => `<option value="${level}" ${levelFilter === level ? "selected" : ""}>Niveau ${level}</option>`).join("")}
          </select>
          <select class="dashboard-lexical-filter" data-lexical-category aria-label="Filtrer par catégorie grammaticale">
            <option value="">Toutes les catégories</option>
            ${categories.map((category) => `<option value="${escapeAttr(category)}" ${categoryFilter === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
          </select>
        </div>
        <div class="dashboard-lexical-toolbar-actions">
          <span class="dashboard-lexical-count">${formatCount(entries.length)} mot${entries.length > 1 ? "s" : ""}</span>
          <button class="btn dashboard-btn-with-icon" type="button" data-lexical-action="export" ${entries.length ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">download</span><span>Exporter XLSX</span>
          </button>
          ${isAdmin() ? `
            <button class="btn dashboard-btn-with-icon" type="button" data-lexical-action="import" ${pendingImport ? "disabled" : ""}>
              <span class="dashboard-material-icon" aria-hidden="true">upload_file</span><span>Importer XLSX</span>
            </button>
            <button class="btn primary dashboard-btn-with-icon" type="button" data-lexical-action="add">
              <span class="dashboard-material-icon" aria-hidden="true">add</span><span>Ajouter un mot</span>
            </button>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-lexical-file hidden>
          ` : ""}
        </div>
      </div>
    `;
  }

  function renderTable(){
    if (isLoading) return `<div class="dashboard-activity-empty-state">Chargement de la banque lexicale…</div>`;
    if (loadError) return `<div class="dashboard-activity-empty-state">${escapeHtml(loadError)}<br><small>Vérifie que la migration SQL 46 a été appliquée.</small></div>`;
    const filtered = getFilteredEntries();
    if (!entries.length) {
      return `<div class="dashboard-activity-empty-state">La nouvelle banque lexicale est vide. ${isAdmin() ? "Importe le XLSX de la banque lexicale pour commencer." : ""}</div>`;
    }
    if (!filtered.length) return `<div class="dashboard-activity-empty-state">Aucun mot ne correspond aux filtres.</div>`;

    return `
      <div class="dashboard-lexical-table-wrap">
        <table class="dashboard-lexical-table">
          <thead>
            <tr>
              ${renderSortHeader("Mot", "entry")}
              ${renderSortHeader("Catégorie", "category")}
              ${renderSortHeader("Niveau", "level", { title:"Niveau lexical" })}
              ${renderSortHeader("CGP", "cgp", { title:"Complexité des correspondances graphème-phonème (1 à 5)" })}
              ${renderSortHeader("Phono", "phonology")}
              ${renderSortHeader("Syllabes", "syllables")}
              ${renderSortHeader("Variantes", "variants")}
            </tr>
          </thead>
          <tbody>
            ${filtered.map((entry) => `
              <tr data-lexical-id="${escapeAttr(entry.id || "")}" tabindex="0" role="button" aria-label="Ouvrir ${escapeAttr(entry.entry)}">
                <td class="is-entry">${escapeHtml(entry.entry)}</td>
                <td>${escapeHtml(entry.category)}</td>
                <td><span class="dashboard-lexical-level-pill">${escapeHtml(entry.lexical_level)}</span></td>
                <td class="is-cgp"><span class="dashboard-lexical-cgp-pill">${getLexicalEntryCgpComplexity(entry)}</span></td>
                <td class="is-code">${escapeHtml(joinCell(entry.phonology))}</td>
                <td class="is-code">${escapeHtml(joinCell(entry.syllabifications))}</td>
                <td>${escapeHtml(renderVariantSummary(entry))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function render(){
    if (!host || !isOpen) return;
    host.classList.remove("dashboard-explorer-host");
    host.innerHTML = `
      <div class="dashboard-lexical-bank-view">
        ${renderToolbar()}
        <div class="dashboard-lexical-content">${renderTable()}</div>
      </div>
    `;
    bindRenderedEvents();
  }

  function openEntryEditor(entry = null){
    if (!isAdmin()) return;
    const current = entry ? normalizeEntry(entry) : normalizeEntry({ lexical_level:1, category:"nom" });
    const overlay = document.createElement("div");
    overlay.className = "modal dashboard-lexical-editor-modal";
    const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...getCategories(), current.category].filter(Boolean)));
    overlay.innerHTML = `
      <div class="modal-content dashboard-lexical-editor-card">
        <div class="dashboard-lexical-editor-head">
          <div class="modal-title">${current.id ? "Modifier le mot" : "Ajouter un mot"}</div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="close" title="Fermer" aria-label="Fermer"><span class="dashboard-material-icon">close</span></button>
        </div>
        <div class="dashboard-lexical-editor-grid">
          <label class="dashboard-lexical-field is-wide"><span>Entrée</span><input name="entry" value="${escapeAttr(current.entry)}" autocomplete="off"></label>
          <label class="dashboard-lexical-field"><span>Catégorie</span><select name="category">${categories.map((category) => `<option value="${escapeAttr(category)}" ${current.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select></label>
          <label class="dashboard-lexical-field"><span>Niveau lexical</span><select name="lexical_level">${LEVELS.map((level) => `<option value="${level}" ${current.lexical_level === level ? "selected" : ""}>Niveau ${level}</option>`).join("")}</select></label>
          <label class="dashboard-lexical-field is-wide"><span>Phono <small>(séparer plusieurs analyses par ;)</small></span><input name="phonology" value="${escapeAttr(joinCell(current.phonology))}" autocomplete="off"></label>
          <label class="dashboard-lexical-field is-wide"><span>Syllabes <small>(séparer plusieurs syllabations par ;)</small></span><input name="syllabifications" value="${escapeAttr(joinCell(current.syllabifications))}" autocomplete="off"></label>
          <label class="dashboard-lexical-field is-wide"><span>Introducteurs <small>(séparés par ;)</small></span><input name="introducers" value="${escapeAttr(joinCell(current.introducers))}" autocomplete="off"></label>
          <label class="dashboard-lexical-field"><span>Masculin singulier</span><input name="masc_sing" value="${escapeAttr(current.masc_sing || "")}" autocomplete="off"></label>
          <label class="dashboard-lexical-field"><span>Féminin singulier</span><input name="fem_sing" value="${escapeAttr(current.fem_sing || "")}" autocomplete="off"></label>
          <label class="dashboard-lexical-field"><span>Masculin pluriel</span><input name="masc_plur" value="${escapeAttr(current.masc_plur || "")}" autocomplete="off"></label>
          <label class="dashboard-lexical-field"><span>Féminin pluriel</span><input name="fem_plur" value="${escapeAttr(current.fem_plur || "")}" autocomplete="off"></label>
        </div>
        <div class="modal-actions dashboard-lexical-editor-actions">
          <div class="modal-message" data-message></div>
          ${current.id ? `<button class="btn danger" type="button" data-action="delete">Supprimer</button>` : ""}
          <button class="btn" type="button" data-action="close">Annuler</button>
          <button class="btn primary" type="button" data-action="save">Enregistrer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const message = overlay.querySelector("[data-message]");
    const input = (name) => overlay.querySelector(`[name="${name}"]`);
    const close = () => overlay.remove();
    const collect = () => normalizeEntry({
      id:current.id,
      entry:input("entry")?.value,
      category:input("category")?.value,
      lexical_level:input("lexical_level")?.value,
      phonology:splitCell(input("phonology")?.value),
      syllabifications:splitCell(input("syllabifications")?.value),
      introducers:splitCell(input("introducers")?.value),
      masc_sing:input("masc_sing")?.value,
      fem_sing:input("fem_sing")?.value,
      masc_plur:input("masc_plur")?.value,
      fem_plur:input("fem_plur")?.value
    });
    const save = async () => {
      const payload = collect();
      if (!payload.entry) { message.textContent = "Le mot est obligatoire."; return; }
      if (!payload.category) { message.textContent = "La catégorie est obligatoire."; return; }
      try {
        overlay.classList.add("is-busy");
        await saveLexicalEntryAsAdmin?.(payload);
        close();
        showToast?.(`${payload.entry} enregistré.`);
        await reload();
        await onChanged?.();
      } catch (error) {
        message.textContent = error?.message || "Enregistrement impossible.";
        overlay.classList.remove("is-busy");
      }
    };
    const remove = async () => {
      const accepted = await openDashboardConfirmDialog({
        title:"Supprimer ce mot ?",
        message:`« ${current.entry} » sera supprimé de la nouvelle banque lexicale. Les outils actuels ne sont pas concernés.`,
        confirmLabel:"Supprimer",
        danger:true
      });
      if (!accepted) return;
      try {
        await deleteLexicalEntryAsAdmin?.(current.id);
        close();
        showToast?.(`${current.entry} supprimé.`);
        await reload();
        await onChanged?.();
      } catch (error) {
        message.textContent = error?.message || "Suppression impossible.";
      }
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest('[data-action="close"]')) close();
      if (event.target.closest('[data-action="save"]')) void save();
      if (event.target.closest('[data-action="delete"]')) void remove();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    input("entry")?.focus();
    input("entry")?.select();
  }

  function exportXlsx(){
    const XLSX = getXlsx();
    const matrix = [XLSX_HEADERS];
    entries
      .slice()
      .sort((a, b) => a.entry.localeCompare(b.entry, "fr", { sensitivity:"base", numeric:true }))
      .forEach((entry) => matrix.push([
        entry.entry,
        entry.category,
        entry.lexical_level,
        joinCell(entry.phonology),
        joinCell(entry.syllabifications),
        joinCell(entry.introducers),
        entry.masc_sing || "",
        entry.fem_sing || "",
        entry.masc_plur || "",
        entry.fem_plur || ""
      ]));
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    sheet["!cols"] = [18,14,14,34,26,48,18,18,18,18].map((wch) => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Banque lexicale");
    XLSX.writeFile(workbook, "banque-lexicale.xlsx", { compression:true });
  }

  async function importXlsxFile(file){
    if (!file || !isAdmin() || pendingImport) return;
    pendingImport = true;
    render();
    try {
      const { rows, errors } = await readWorkbookRows(file);
      if (errors.length) {
        const visibleErrors = errors.slice(0, 8).join("\n");
        throw new Error(`${visibleErrors}${errors.length > 8 ? `\n… et ${errors.length - 8} autre(s) erreur(s).` : ""}`);
      }
      const currentByKey = new Map(entries.map((entry) => [entry.entry_key, entry]));
      let inserted = 0;
      let modified = 0;
      let unchanged = 0;
      rows.forEach((row) => {
        const existing = currentByKey.get(row.entry_key);
        if (!existing) inserted += 1;
        else if (comparableEntry(existing) === comparableEntry(row)) unchanged += 1;
        else modified += 1;
      });

      const accepted = await openDashboardConfirmDialog({
        title:"Importer la banque lexicale",
        message:[
          `${rows.length} ligne${rows.length > 1 ? "s" : ""} valide${rows.length > 1 ? "s" : ""}.`,
          `${inserted} nouveau${inserted > 1 ? "x" : ""} mot${inserted > 1 ? "s" : ""}.`,
          `${modified} mot${modified > 1 ? "s" : ""} à mettre à jour.`,
          `${unchanged} inchangé${unchanged > 1 ? "s" : ""}.`,
          "Les mots absents du fichier ne seront pas supprimés."
        ].join("\n"),
        confirmLabel:"Importer"
      });
      if (!accepted) return;
      await upsertLexicalEntriesAsAdmin?.(rows);
      showToast?.(`Import terminé : ${inserted} ajout${inserted > 1 ? "s" : ""}, ${modified} mise${modified > 1 ? "s" : ""} à jour.`);
      await reload();
      await onChanged?.();
    } catch (error) {
      console.error("Import XLSX de la banque lexicale impossible.", error);
      showToast?.(error?.message || "Import XLSX impossible.", { isError:true });
    } finally {
      pendingImport = false;
      render();
    }
  }

  function bindRenderedEvents(){
    if (!host) return;
    host.querySelector('[data-lexical-action="back"]')?.addEventListener("click", () => close());
    host.querySelector('[data-lexical-action="add"]')?.addEventListener("click", () => openEntryEditor());
    host.querySelector('[data-lexical-action="export"]')?.addEventListener("click", () => {
      try { exportXlsx(); }
      catch (error) { showToast?.(error?.message || "Export XLSX impossible.", { isError:true }); }
    });
    const fileInput = host.querySelector("[data-lexical-file]");
    host.querySelector('[data-lexical-action="import"]')?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0] || null;
      fileInput.value = "";
      if (file) void importXlsxFile(file);
    });
    const searchInput = host.querySelector("[data-lexical-search]");
    searchInput?.addEventListener("input", () => {
      search = searchInput.value || "";
      render();
      const next = host.querySelector("[data-lexical-search]");
      next?.focus();
      try { next?.setSelectionRange(search.length, search.length); } catch {}
    });
    host.querySelector("[data-lexical-level]")?.addEventListener("change", (event) => {
      levelFilter = event.currentTarget.value ? normalizeLexicalLevel(event.currentTarget.value) : "";
      render();
    });
    host.querySelector("[data-lexical-category]")?.addEventListener("change", (event) => {
      categoryFilter = String(event.currentTarget.value || "");
      render();
    });
    host.querySelectorAll("[data-lexical-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextKey = String(button.dataset.lexicalSort || "entry");
        if (sortKey === nextKey) sortDirection = sortDirection === "asc" ? "desc" : "asc";
        else {
          sortKey = nextKey;
          sortDirection = "asc";
        }
        render();
      });
    });
    host.querySelectorAll("[data-lexical-id]").forEach((row) => {
      const open = () => {
        const entry = entries.find((item) => String(item.id) === String(row.dataset.lexicalId));
        if (entry) openEntryEditor(entry);
      };
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function close(){
    setOpenState(false);
    onBack?.();
  }

  return {
    async open(){
      setOpenState(true);
      render();
      await reload();
    },
    close,
    async refresh(){
      if (isOpen) await reload();
    },
    isOpen: () => isOpen,
    getEntryCount: () => entries.length
  };
}
