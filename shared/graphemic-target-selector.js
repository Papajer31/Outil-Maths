import {
  normalizeGraphemicEntries,
  parseGraphemicEntryText
} from "./graphemic-targets.js";

let stylesInjected = false;

export function renderGraphemicTargetSelector(settings = {}, {
  idPrefix = "graphemic",
  title = "Entrée graphémique"
} = {}) {
  const entries = normalizeGraphemicEntries(settings?.graphemicEntries || settings?.graphemes || []);
  const excludedEntries = normalizeGraphemicEntries(
    settings?.excludedGraphemicEntries
      || settings?.graphemicExcludedEntries
      || settings?.graphemicExclusions
      || []
  );

  return `
    <section class="tv-group gts-group" data-gts-root="${escapeAttr(idPrefix)}">
      <div class="tv-group-title">${escapeHtml(title)}</div>

      ${renderEntryBlock({
        kind:"include",
        buttonLabel:"Inclure",
        placeholder:"Ex. tr, ette, ouille",
        ariaLabel:"Graphie à inclure",
        entries
      })}

      ${renderEntryBlock({
        kind:"exclude",
        buttonLabel:"Exclure",
        placeholder:"Ex. tion",
        ariaLabel:"Graphie à exclure",
        entries:excludedEntries
      })}

      <div class="gts-feedback" data-gts-feedback aria-live="polite"></div>
    </section>
  `;
}

export function bindGraphemicTargetSelector(container, {
  idPrefix = "graphemic",
  onChange = null
} = {}) {
  ensureStyles();
  const root = findRoot(container, idPrefix);
  if (!root || root.dataset.gtsBound === "1") return;
  root.dataset.gtsBound = "1";

  const emitChange = () => {
    if (typeof onChange === "function") onChange(readGraphemicTargetSelector(container, { idPrefix }));
  };

  for (const kind of ["include", "exclude"]) {
    const input = root.querySelector(`[data-gts-entry-input="${kind}"]`);
    const addButton = root.querySelector(`[data-gts-add="${kind}"]`);

    const addFromInput = () => {
      if (!(input instanceof HTMLInputElement)) return;
      const raw = String(input.value || "").trim();
      if (!raw) return;
      const parsed = parseGraphemicEntryText(raw);
      if (!parsed.length) {
        setFeedback(root, "Utilise uniquement des lettres, sans ponctuation dans chaque graphie.", true);
        return;
      }

      const current = readGraphemicTargetSelector(container, { idPrefix });
      const currentEntries = kind === "exclude"
        ? current.excludedGraphemicEntries
        : current.graphemicEntries;
      const next = normalizeGraphemicEntries([...currentEntries, ...parsed]);
      renderChipHost(root, kind, next);
      input.value = "";
      setFeedback(root, "", false);
      input.focus();
      emitChange();
    };

    addButton?.addEventListener("click", addFromInput);
    input?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addFromInput();
    });
  }

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-gts-remove]") : null;
    if (!(button instanceof HTMLButtonElement) || !root.contains(button)) return;
    const value = String(button.dataset.gtsRemove || "");
    const kind = button.dataset.gtsKind === "exclude" ? "exclude" : "include";
    const current = readGraphemicTargetSelector(container, { idPrefix });
    const currentEntries = kind === "exclude"
      ? current.excludedGraphemicEntries
      : current.graphemicEntries;
    const next = currentEntries.filter((entry) => entry !== value);
    renderChipHost(root, kind, next);
    setFeedback(root, "", false);
    emitChange();
  });
}

export function readGraphemicTargetSelector(container, {
  idPrefix = "graphemic"
} = {}) {
  const root = findRoot(container, idPrefix);
  if (!root) return { graphemicEntries:[], excludedGraphemicEntries:[] };

  const readKind = (kind) => normalizeGraphemicEntries(
    [...root.querySelectorAll(`[data-gts-remove][data-gts-kind="${kind}"]`)]
      .map((button) => button instanceof HTMLElement ? String(button.dataset.gtsRemove || "") : "")
      .filter(Boolean)
  );

  return {
    graphemicEntries:readKind("include"),
    excludedGraphemicEntries:readKind("exclude")
  };
}

function renderEntryBlock({ kind, buttonLabel, placeholder, ariaLabel, entries }) {
  const isExclude = kind === "exclude";
  return `
    <div class="gts-entry-block${isExclude ? " gts-entry-block--exclude" : ""}">
      <div class="gts-entry-row">
        <input
          class="gts-entry-input"
          type="text"
          data-gts-entry-input="${escapeAttr(kind)}"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="${escapeAttr(placeholder)}"
          aria-label="${escapeAttr(ariaLabel)}"
        >
        <button class="gts-add-button${isExclude ? " gts-add-button--exclude" : ""}" type="button" data-gts-add="${escapeAttr(kind)}">${escapeHtml(buttonLabel)}</button>
      </div>
      <div class="gts-chips${isExclude ? " gts-chips--exclude" : ""}" data-gts-chips="${escapeAttr(kind)}">${renderChips(entries, kind)}</div>
    </div>
  `;
}

function renderChipHost(root, kind, entries) {
  const host = root.querySelector(`[data-gts-chips="${kind}"]`);
  if (host) host.innerHTML = renderChips(entries, kind);
}

function renderChips(entries, kind) {
  if (!entries.length) return "";
  return entries.map((entry) => `
    <span class="gts-chip${kind === "exclude" ? " gts-chip--exclude" : ""}">
      <span>${escapeHtml(entry)}</span>
      <button
        type="button"
        data-gts-remove="${escapeAttr(entry)}"
        data-gts-kind="${escapeAttr(kind)}"
        aria-label="Retirer ${escapeAttr(entry)}"
      >×</button>
    </span>
  `).join("");
}

function setFeedback(root, text, isError) {
  const host = root.querySelector("[data-gts-feedback]");
  if (!host) return;
  host.textContent = String(text || "");
  host.classList.toggle("is-error", isError === true);
}

function findRoot(container, idPrefix) {
  return container?.querySelector?.(`[data-gts-root="${cssEscape(idPrefix)}"]`) || null;
}

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./graphemic-target-selector.css", import.meta.url).href;
  if (document.querySelector(`link[data-gts-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.gtsStyle = href;
  document.head.appendChild(link);
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value || ""));
  return String(value || "").replace(/["\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
