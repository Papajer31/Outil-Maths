import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  WORD_COUNT_OPTIONS,
  ALL_TARGET_ID,
  getDefaultSettings,
  normalizeSettings,
  setWordCatalog,
  getEligibleWordCount,
  getEligibleTargetCount,
  getPhonemicSpellingUsage,
  canGenerateQuestion,
  getRelevanceDiagnostics
} from "./model.js";
import {
  WORD_SELECTION_MODES,
  renderWordSelectionSelector,
  bindWordSelectionSelector,
  readWordSelectionSelector,
  updateWordSelectionSpellingUsage
} from "../../shared/word-selection-selector.js";

let stylesInjected = false;
let catalogPromise = null;
let catalogStatus = "idle";
let catalogError = "";

export function renderToolSettings(container, settings = {}) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="rg-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Nombre de mots par question",
          id: "rg_wordCount",
          value: String(cfg.wordCount),
          options: WORD_COUNT_OPTIONS.map((value) => ({
            value: String(value),
            label: `${value} mot${value > 1 ? "s" : ""}`
          }))
        }),
        renderWordSelectionSelector(cfg, {
          idPrefix:"rg",
          allTargetId:ALL_TARGET_ID,
          showRelevanceLevels:true,
          bankStatusMarkup:`<div class="rg-config-bank-status" data-rg-bank-status aria-live="polite"></div>`,
          afterSelectionMarkup:`<div data-rg-phonemic-only>${renderRadioGroup({
            title: "Affichage des graphies possibles",
            id: "rg_showPossibleSpellings",
            value: cfg.showPossibleSpellings ? "show" : "hide",
            options: [
              { value:"show", label:"Afficher" },
              { value:"hide", label:"Ne pas afficher" }
            ]
          })}</div>`
        }),
        `<details class="rg-relevance-diagnostic" hidden>
          <summary>Diagnostic de pertinence</summary>
          <div class="rg-relevance-diagnostic__body">
            <input class="rg-relevance-diagnostic__search" type="search" data-rg-relevance-search placeholder="Tester un mot…" autocomplete="off">
            <div data-rg-relevance-diagnostic-results></div>
          </div>
        </details>`
      )}
    </div>
  `;

  bindRadio(container, "rg_wordCount", {
    onChange: () => refreshBankStatus(container)
  });
  bindRadio(container, "rg_showPossibleSpellings");

  bindWordSelectionSelector(container, {
    idPrefix:"rg",
    allTargetId:ALL_TARGET_ID,
    onChange:() => {
      syncModeSpecificControls(container);
      refreshBankStatus(container);
      refreshRelevanceDiagnostic(container);
    }
  });

  container.querySelector("[data-rg-relevance-search]")?.addEventListener("input", () => refreshRelevanceDiagnostic(container));

  syncModeSpecificControls(container);
  refreshBankStatus(container);
  refreshRelevanceDiagnostic(container);
  ensureWordCatalogLoaded()
    .then(() => {
      refreshBankStatus(container);
      refreshRelevanceDiagnostic(container);
    })
    .catch(() => {
      refreshBankStatus(container);
      refreshRelevanceDiagnostic(container);
    });
}

export function readToolSettings(container) {
  const settings = readCurrentSettings(container);

  if (catalogStatus === "loading" || catalogStatus === "idle") {
    throw new Error("Chargement de la banque de mots en cours.");
  }

  if (catalogStatus === "error") {
    throw new Error(catalogError || "La banque de mots est indisponible.");
  }

  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC && !settings.graphemicEntries.length) {
    throw new Error("Ajoute au moins une entrée graphémique.");
  }

  if (!canGenerateQuestion(settings)) {
    const availableCount = getEligibleWordCount(settings);
    if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
      throw new Error(`La banque ne contient que ${availableCount} mot${availableCount > 1 ? "s" : ""} compatible${availableCount > 1 ? "s" : ""} avec ces entrées graphémiques et ce niveau de pertinence.`);
    }
    if (settings.targetId === ALL_TARGET_ID) {
      throw new Error("Aucun phonème ne contient assez de mots pour générer cette question.");
    }
    throw new Error(`La banque ne contient que ${availableCount} mot${availableCount > 1 ? "s" : ""} compatible${availableCount > 1 ? "s" : ""} avec ce phonème.`);
  }

  return settings;
}

export { getDefaultSettings };

function readCurrentSettings(container) {
  const selection = readWordSelectionSelector(container, {
    idPrefix:"rg",
    allTargetId:ALL_TARGET_ID
  });
  return normalizeSettings({
    ...selection,
    wordCount:Number(readRadio(container, "rg_wordCount", "6")),
    showPossibleSpellings:readRadio(container, "rg_showPossibleSpellings", "hide") === "show"
  });
}

function syncModeSpecificControls(container) {
  const selection = readWordSelectionSelector(container, { idPrefix:"rg", allTargetId:ALL_TARGET_ID });
  const phonemicOnly = container.querySelector("[data-rg-phonemic-only]");
  if (phonemicOnly instanceof HTMLElement) {
    phonemicOnly.hidden = selection.wordSelectionMode !== WORD_SELECTION_MODES.PHONEMIC;
  }
}

function refreshBankStatus(container) {
  const host = container.querySelector("[data-rg-bank-status]");
  if (!host) return;

  host.classList.remove("is-error", "is-warning", "is-ready");

  if (catalogStatus === "idle" || catalogStatus === "loading") {
    host.textContent = "Chargement de la banque de mots…";
    return;
  }

  if (catalogStatus === "error") {
    host.classList.add("is-error");
    host.textContent = catalogError || "Impossible de charger la banque de mots.";
    return;
  }

  const settings = readCurrentSettings(container);
  updateWordSelectionSpellingUsage(container, {
    idPrefix:"rg",
    usageByTarget:getPhonemicSpellingUsage(settings)
  });
  const count = getEligibleWordCount(settings);
  const targetCount = getEligibleTargetCount(settings);
  const enough = canGenerateQuestion(settings);
  host.classList.add(enough ? "is-ready" : "is-warning");

  const levelLabel = settings.relevanceLevel === "simple" ? "Simple" : settings.relevanceLevel === "complexe" ? "Complexe" : "Normal";
  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
    if (!settings.graphemicEntries.length) {
      host.classList.remove("is-ready");
      host.classList.add("is-warning");
      host.textContent = "Ajoute au moins une entrée graphémique.";
      return;
    }
    host.textContent = `${targetCount} entrée${targetCount > 1 ? "s" : ""} graphémique${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} en mode « ${levelLabel} »${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
    return;
  }

  if (settings.targetIds.length !== 1 || settings.targetIds[0] === ALL_TARGET_ID) {
    host.textContent = `${targetCount} phonème${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} à partir de ${count} mot${count > 1 ? "s" : ""} distinct${count > 1 ? "s" : ""}${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
    return;
  }

  host.textContent = `${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} en mode « ${levelLabel} » dans la banque${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
}

function refreshRelevanceDiagnostic(container) {
  const host = container.querySelector("[data-rg-relevance-diagnostic-results]");
  if (!host) return;

  if (catalogStatus === "idle" || catalogStatus === "loading") {
    host.innerHTML = '<div class="rg-relevance-diagnostic__empty">Chargement de la banque…</div>';
    return;
  }
  if (catalogStatus === "error") {
    host.innerHTML = '<div class="rg-relevance-diagnostic__empty">Diagnostic indisponible.</div>';
    return;
  }

  const settings = readCurrentSettings(container);
  const query = container.querySelector("[data-rg-relevance-search]")?.value || "";
  const diagnostic = getRelevanceDiagnostics(settings, { query, perCategory:4 });
  if (!diagnostic.target) {
    host.innerHTML = '<div class="rg-relevance-diagnostic__empty">Sélectionne une seule cible phonémique ou graphémique pour inspecter les scores mot par mot.</div>';
    return;
  }

  const counts = diagnostic.counts;
  const rows = diagnostic.rows;
  const chips = [
    ["simple", "Simple", counts.simple],
    ["normal", "Normal", counts.normal],
    ["complexe", "Complexe", counts.complexe],
    ["excluded", "Exclus", counts.excluded]
  ].map(([id, label, count]) => `<span class="rg-relevance-chip rg-relevance-chip--${id}"><strong>${count}</strong> ${label}</span>`).join("");

  const table = rows.length ? `
    <div class="rg-relevance-table-wrap">
      <table class="rg-relevance-table">
        <thead><tr><th>Mot</th><th>Score</th><th>Classe</th><th>Pureté</th><th>Occ.</th><th>Structure</th><th>Parasites</th><th>Familiarité</th></tr></thead>
        <tbody>${rows.map((row) => {
          const c = row.components || {};
          const title = row.severePurityIssue ? ' title="Pureté critique : semi-voyelle adjacente dans la même syllabe"' : "";
          return `<tr${title}>
            <td><strong>${escapeHtml(row.word)}</strong>${row.severePurityIssue ? '<span class="rg-relevance-critical">!</span>' : ""}</td>
            <td>${formatScore(row.score)}</td>
            <td>${escapeHtml(row.categoryLabel)}</td>
            <td>${formatPoints(c.purity)}</td>
            <td>${formatPoints(c.occurrences)}</td>
            <td>${formatPoints(c.structure)}</td>
            <td>${formatPoints(c.cleanliness)}</td>
            <td>${formatPoints(c.familiarity)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>` : '<div class="rg-relevance-diagnostic__empty">Aucun mot correspondant.</div>';

  const targetLabel = diagnostic.target.kind === "graphemic"
    ? `Graphie « ${escapeHtml(diagnostic.target.grapheme)} »`
    : `Phonème « ${escapeHtml(diagnostic.target.bubbleText)} »`;
  host.innerHTML = `
    <div class="rg-relevance-diagnostic__target">${targetLabel} · ${diagnostic.total} mots strictement compatibles</div>
    <div class="rg-relevance-chips">${chips}</div>
    ${table}
    <div class="rg-relevance-diagnostic__note">Score = pureté 30 + occurrences 10 + structure 15 + absence de parasites 30 + familiarité 15. Seuils : Simple ≥ 90 ; Normal 80–89,9 ; Complexe 60–79,9 ; Exclu < 60. « ! » signale une occurrence perceptivement liée à une semi-voyelle : elle reste toujours sous le seuil d’exclusion.</div>
  `;
}

function formatPoints(component) {
  const points = Number(component?.points);
  const weight = Number(component?.weight);
  if (!Number.isFinite(points) || !Number.isFinite(weight)) return "–";
  return `${formatScore(points)}/${weight}`;
}

function formatScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "–";
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(".", ",");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function ensureWordCatalogLoaded() {
  if (!catalogPromise) {
    catalogStatus = "loading";
    catalogError = "";
    catalogPromise = listPublicPhonologyWords()
      .then((rows) => {
        setWordCatalog(Array.isArray(rows) ? rows : []);
        catalogStatus = "ready";
        return rows;
      })
      .catch((error) => {
        catalogPromise = null;
        catalogStatus = "error";
        catalogError = String(error?.message || "Impossible de charger la banque de mots.");
        setWordCatalog([]);
        throw error;
      });
  }

  return await catalogPromise;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-rg-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rgConfigStyle = href;
  document.head.appendChild(link);
}
