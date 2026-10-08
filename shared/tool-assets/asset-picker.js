let activePicker = null;

export async function openToolAssetPicker(options = {}) {
  if (activePicker?.close) activePicker.close(null);

  const type = String(options.type || "image").trim().toLowerCase() || "image";
  const title = String(options.title || (type === "audio" ? "Choisir un audio" : "Choisir une image")).trim();
  const emptyMessage = String(options.emptyMessage || "Aucune ressource disponible.").trim();
  const multiple = options.multiple === true;
  const confirmLabel = String(options.confirmLabel || "Ajouter").trim() || "Ajouter";

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "tool-asset-picker-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", title);
    overlay.innerHTML = `
      <div class="tool-asset-picker-card">
        <div class="tool-asset-picker-header">
          <div>
            <div class="tool-asset-picker-kicker">Ressources</div>
            <div class="tool-asset-picker-title">${escapeHtml(title)}</div>
          </div>
          <button class="tool-asset-picker-close" type="button" data-tool-asset-close aria-label="Fermer" title="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>
        <div class="tool-asset-picker-controls">
          <div class="tool-asset-picker-scopes" role="tablist" aria-label="Origine des ressources"></div>
          <label class="tool-asset-picker-search">
            <svg class="tool-asset-picker-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9.8 4.5a5.3 5.3 0 1 1 0 10.6 5.3 5.3 0 0 1 0-10.6Zm0-2a7.3 7.3 0 1 0 4.55 13.01l4.07 4.07a1 1 0 0 0 1.41-1.41l-4.07-4.07A7.3 7.3 0 0 0 9.8 2.5Z" fill="currentColor"/>
            </svg>
            <input class="tool-asset-picker-search-input" type="search" placeholder="Rechercher…" title="a* : commence par a · *a : finit par a · *a* : a à l’intérieur du mot" autocomplete="off">
          </label>
        </div>
        <div class="tool-asset-picker-body">
          <nav class="tool-asset-picker-breadcrumb" aria-label="Navigation dans les ressources"></nav>
          <div class="tool-asset-picker-status" aria-live="polite">Chargement des ressources…</div>
          <div class="tool-asset-picker-grid${type === "audio" ? " is-audio-picker" : ""}" role="listbox" ${multiple ? 'aria-multiselectable="true"' : ''} aria-label="${type === "audio" ? "Audios disponibles" : "Images disponibles"}"></div>
        </div>
        ${multiple ? `
          <div class="tool-asset-picker-footer">
            <span class="tool-asset-picker-selection-count" data-tool-asset-selection-count>Aucune sélection</span>
            <div class="tool-asset-picker-footer-actions">
              <button class="tool-asset-picker-footer-button" type="button" data-tool-asset-cancel>Annuler</button>
              <button class="tool-asset-picker-footer-button is-primary" type="button" data-tool-asset-confirm disabled>${escapeHtml(confirmLabel)}</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(overlay);

    const searchInput = overlay.querySelector(".tool-asset-picker-search-input");
    const scopes = overlay.querySelector(".tool-asset-picker-scopes");
    const breadcrumb = overlay.querySelector(".tool-asset-picker-breadcrumb");
    const status = overlay.querySelector(".tool-asset-picker-status");
    const grid = overlay.querySelector(".tool-asset-picker-grid");

    let assets = [];
    let folders = [];
    let selectedScope = "system";
    let currentFolderId = null;
    let closed = false;
    const selectedAssetIds = new Set();

    const close = (asset) => {
      if (closed) return;
      closed = true;
      overlay.querySelectorAll("audio").forEach((audio) => { try { audio.pause(); } catch {} });
      overlay.remove();
      activePicker = null;
      resolve(asset ?? null);
    };

    activePicker = { close };

    const scopeLabel = (scope) => scope === "personal" ? "Mes ressources" : "Ressources du site";
    const folderById = () => new Map(folders.map((folder) => [folder.id, folder]));

    const getCurrentFolderPath = () => {
      if (!currentFolderId) return [];
      const byId = folderById();
      const path = [];
      const visited = new Set();
      let cursor = byId.get(currentFolderId) || null;
      while (cursor && !visited.has(cursor.id)) {
        visited.add(cursor.id);
        path.unshift(cursor);
        cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
      }
      return path;
    };

    const folderIsWithinCurrent = (folderId) => {
      if (!currentFolderId) return true;
      let cursorId = String(folderId || "");
      const byId = folderById();
      const visited = new Set();
      while (cursorId && !visited.has(cursorId)) {
        if (cursorId === currentFolderId) return true;
        visited.add(cursorId);
        cursorId = String(byId.get(cursorId)?.parentId || "");
      }
      return false;
    };

    const renderScopes = () => {
      if (!scopes) return;
      const available = ["system", "personal"].filter((scope) =>
        assets.some((asset) => asset.scope === scope) || folders.some((folder) => folder.scope === scope)
      );
      if (!available.includes(selectedScope)) selectedScope = available[0] || "system";
      scopes.innerHTML = available.map((scope) => `
        <button
          class="tool-asset-picker-scope${scope === selectedScope ? " is-active" : ""}"
          type="button"
          role="tab"
          data-tool-asset-scope="${escapeAttr(scope)}"
          aria-selected="${scope === selectedScope ? "true" : "false"}"
        >${escapeHtml(scopeLabel(scope))}</button>
      `).join("");
    };

    const renderBreadcrumb = () => {
      if (!breadcrumb) return;
      const parts = [
        `<button class="tool-asset-picker-crumb${currentFolderId ? "" : " is-current"}" type="button" data-tool-asset-root>${escapeHtml(scopeLabel(selectedScope))}</button>`
      ];
      getCurrentFolderPath().forEach((folder) => {
        parts.push(`<span class="dashboard-material-icon tool-asset-picker-crumb-separator" aria-hidden="true">chevron_right</span>`);
        parts.push(`<button class="tool-asset-picker-crumb${folder.id === currentFolderId ? " is-current" : ""}" type="button" data-tool-asset-folder-crumb="${escapeAttr(folder.id)}">${escapeHtml(folder.label)}</button>`);
      });
      breadcrumb.innerHTML = parts.join("");
    };

    const getVisibleFolders = () => {
      const query = normalizePickerSearchQuery(searchInput?.value || "");
      if (query) return [];
      return folders
        .filter((folder) => folder.scope === selectedScope && String(folder.parentId || "") === String(currentFolderId || ""))
        .sort(compareByOrderThenLabel);
    };

    const getVisibleAssets = () => {
      const query = normalizePickerSearchQuery(searchInput?.value || "");
      const matchesSearch = createPickerSearchMatcher(query);
      return assets
        .filter((asset) => {
          if (asset.scope !== selectedScope) return false;
          if (query) {
            if (!folderIsWithinCurrent(asset.folderId)) return false;
            return matchesSearch(asset);
          }
          return String(asset.folderId || "") === String(currentFolderId || "");
        })
        .sort(compareByOrderThenLabel);
    };

    const countAssetsInFolder = (folderId) => assets.filter((asset) =>
      asset.scope === selectedScope && isFolderDescendantOrSelf(asset.folderId, folderId, folders)
    ).length;

    const renderFolderItem = (folder) => {
      const count = countAssetsInFolder(folder.id);
      const noun = type === "audio" ? "audio" : "image";
      return `
        <button class="tool-asset-picker-item is-folder" type="button" data-tool-asset-folder="${escapeAttr(folder.id)}">
          <span class="tool-asset-picker-folder-tile-icon dashboard-material-icon" aria-hidden="true">folder</span>
          <span class="tool-asset-picker-folder-tile-copy">
            <strong>${escapeHtml(folder.label)}</strong>
            <small>${count} ${noun}${count > 1 ? "s" : ""}</small>
          </span>
          <span class="dashboard-material-icon tool-asset-picker-folder-tile-chevron" aria-hidden="true">chevron_right</span>
        </button>
      `;
    };

    const renderParentItem = () => `
      <button class="tool-asset-picker-item is-folder is-parent" type="button" data-tool-asset-parent>
        <span class="tool-asset-picker-folder-tile-icon dashboard-material-icon" aria-hidden="true">arrow_upward</span>
        <span class="tool-asset-picker-folder-tile-copy">
          <strong>Dossier parent</strong>
          <small>Revenir au niveau précédent</small>
        </span>
        <span class="dashboard-material-icon tool-asset-picker-folder-tile-chevron" aria-hidden="true">chevron_right</span>
      </button>
    `;

    const renderAssetItem = (asset) => {
      if (type === "audio") {
        return `
          <article class="tool-asset-picker-item is-audio" role="option" tabindex="0" data-tool-asset-id="${escapeAttr(asset.id)}" title="${escapeAttr(asset.label || asset.id)}">
            <div class="tool-asset-picker-audio-actions">
              <button class="tool-asset-picker-audio-toggle" type="button" data-tool-asset-audio-toggle aria-label="Lire l’audio" title="Lire l’audio">
                <span class="dashboard-material-icon" aria-hidden="true" data-tool-asset-audio-icon>play_arrow</span>
              </button>
              <button class="tool-asset-picker-select" type="button" data-tool-asset-select>Utiliser</button>
            </div>
            <audio class="tool-asset-picker-audio" preload="metadata" src="${escapeAttr(asset.url || asset.src)}" data-tool-asset-audio></audio>
            <span class="tool-asset-picker-label">${escapeHtml(asset.label || asset.id)}</span>
          </article>
        `;
      }
      const selected = multiple && selectedAssetIds.has(asset.id);
      return `
        <button
          class="tool-asset-picker-item is-image${selected ? " is-selected" : ""}"
          type="button"
          role="option"
          aria-selected="${selected ? "true" : "false"}"
          data-tool-asset-id="${escapeAttr(asset.id)}"
          title="${escapeAttr(asset.label || asset.id)}"
        >
          <span class="tool-asset-picker-media">
            <img class="tool-asset-picker-image" src="${escapeAttr(asset.url || asset.src)}" alt="${escapeAttr(asset.alt || asset.label || asset.id)}" decoding="async">
          </span>
          <span class="tool-asset-picker-label">${escapeHtml(asset.label || asset.id)}</span>
          ${multiple ? `<span class="tool-asset-picker-selected-mark dashboard-material-icon" aria-hidden="true">${selected ? "check_circle" : "radio_button_unchecked"}</span>` : ""}
        </button>
      `;
    };

    const renderGrid = () => {
      if (!grid || !status) return;
      const visibleFolders = getVisibleFolders();
      const visibleAssets = getVisibleAssets();
      const query = normalizePickerSearchQuery(searchInput?.value || "");
      const itemNoun = type === "audio" ? "audio" : "image";

      if (query) {
        status.textContent = visibleAssets.length
          ? `${visibleAssets.length} ${itemNoun}${visibleAssets.length > 1 ? "s" : ""} trouvé${visibleAssets.length > 1 ? "es" : "e"}`
          : emptyMessage;
      } else {
        status.textContent = visibleFolders.length || visibleAssets.length
          ? `${visibleFolders.length} dossier${visibleFolders.length > 1 ? "s" : ""} · ${visibleAssets.length} ${itemNoun}${visibleAssets.length > 1 ? "s" : ""}`
          : emptyMessage;
      }
      status.classList.toggle("is-empty", visibleFolders.length === 0 && visibleAssets.length === 0);
      const parentMarkup = !query && currentFolderId ? renderParentItem() : "";
      const navigationMarkup = `${parentMarkup}${visibleFolders.map(renderFolderItem).join("")}`;
      grid.innerHTML = `${navigationMarkup ? `<div class="tool-asset-picker-navigation">${navigationMarkup}</div>` : ""}${visibleAssets.map(renderAssetItem).join("")}`;
      grid.querySelectorAll("[data-tool-asset-audio]").forEach((audio) => {
        audio.addEventListener("play", () => syncAudioToggle(audio));
        audio.addEventListener("pause", () => syncAudioToggle(audio));
        audio.addEventListener("ended", () => syncAudioToggle(audio));
      });
    };

    const renderSelectionFooter = () => {
      if (!multiple) return;
      const count = selectedAssetIds.size;
      const countNode = overlay.querySelector("[data-tool-asset-selection-count]");
      const confirmButton = overlay.querySelector("[data-tool-asset-confirm]");
      const noun = type === "audio" ? "audio" : "image";
      const selectedLabel = type === "audio"
        ? `sélectionné${count > 1 ? "s" : ""}`
        : `sélectionnée${count > 1 ? "s" : ""}`;
      if (countNode) countNode.textContent = count
        ? `${count} ${noun}${count > 1 ? "s" : ""} ${selectedLabel}`
        : "Aucune sélection";
      if (confirmButton) {
        confirmButton.disabled = count === 0;
        confirmButton.textContent = count
          ? `${confirmLabel} ${count} ${noun}${count > 1 ? "s" : ""}`
          : confirmLabel;
      }
    };

    // Important : sélectionner/désélectionner ne rerend jamais la grille.
    // Cela conserve le scroll, le focus et les images déjà chargées.
    const toggleAssetSelection = (item, assetId) => {
      if (!multiple) return;
      const id = String(assetId || "");
      if (!id) return;
      const nextSelected = !selectedAssetIds.has(id);
      if (nextSelected) selectedAssetIds.add(id);
      else selectedAssetIds.delete(id);
      item?.classList.toggle("is-selected", nextSelected);
      item?.setAttribute("aria-selected", nextSelected ? "true" : "false");
      const mark = item?.querySelector(".tool-asset-picker-selected-mark");
      if (mark) mark.textContent = nextSelected ? "check_circle" : "radio_button_unchecked";
      renderSelectionFooter();
    };

    const syncAudioToggle = (audio) => {
      const item = audio.closest("[data-tool-asset-id]");
      const button = item?.querySelector("[data-tool-asset-audio-toggle]");
      const icon = item?.querySelector("[data-tool-asset-audio-icon]");
      if (!button || !icon) return;
      const isPlaying = !audio.paused && !audio.ended;
      const label = isPlaying ? "Mettre l’audio en pause" : "Lire l’audio";
      icon.textContent = isPlaying ? "pause" : "play_arrow";
      button.setAttribute("aria-label", label);
      button.title = label;
    };

    const renderNavigation = () => {
      renderScopes();
      renderBreadcrumb();
      renderGrid();
      renderSelectionFooter();
    };

    overlay.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target === overlay || target.closest("[data-tool-asset-close]")) {
        close(null);
        return;
      }

      const scopeButton = target.closest("[data-tool-asset-scope]");
      if (scopeButton && scopes?.contains(scopeButton)) {
        selectedScope = scopeButton.dataset.toolAssetScope === "personal" ? "personal" : "system";
        currentFolderId = null;
        renderNavigation();
        return;
      }

      const rootButton = target.closest("[data-tool-asset-root]");
      if (rootButton && breadcrumb?.contains(rootButton)) {
        currentFolderId = null;
        renderBreadcrumb();
        renderGrid();
        return;
      }

      const crumb = target.closest("[data-tool-asset-folder-crumb]");
      if (crumb && breadcrumb?.contains(crumb)) {
        currentFolderId = String(crumb.dataset.toolAssetFolderCrumb || "") || null;
        renderBreadcrumb();
        renderGrid();
        return;
      }

      const parentButton = target.closest("[data-tool-asset-parent]");
      if (parentButton && grid?.contains(parentButton)) {
        const current = folderById().get(String(currentFolderId || ""));
        currentFolderId = current?.parentId || null;
        if (searchInput) searchInput.value = "";
        renderBreadcrumb();
        renderGrid();
        return;
      }

      const folder = target.closest("[data-tool-asset-folder]");
      if (folder && grid?.contains(folder)) {
        currentFolderId = String(folder.dataset.toolAssetFolder || "") || null;
        if (searchInput) searchInput.value = "";
        renderBreadcrumb();
        renderGrid();
        return;
      }

      const audioToggle = target.closest("[data-tool-asset-audio-toggle]");
      if (audioToggle && grid?.contains(audioToggle)) {
        const item = audioToggle.closest("[data-tool-asset-id]");
        const audio = item?.querySelector("[data-tool-asset-audio]");
        if (!audio) return;
        if (audio.paused) {
          grid.querySelectorAll("[data-tool-asset-audio]").forEach((otherAudio) => {
            if (otherAudio !== audio) otherAudio.pause();
          });
          void audio.play().catch(() => {});
        } else {
          audio.pause();
        }
        return;
      }

      if (target.closest("[data-tool-asset-audio]")) return;

      if (target.closest("[data-tool-asset-cancel]")) {
        close(null);
        return;
      }

      if (target.closest("[data-tool-asset-confirm]")) {
        const selected = assets.filter((asset) => selectedAssetIds.has(asset.id));
        if (selected.length) close(selected);
        return;
      }

      const item = target.closest("[data-tool-asset-id]");
      if (item && grid?.contains(item)) {
        const isAudioItem = item.classList.contains("is-audio");
        if (isAudioItem && !target.closest("[data-tool-asset-select]")) return;
        const assetId = item.dataset.toolAssetId || "";
        if (multiple) toggleAssetSelection(item, assetId);
        else close(assets.find((asset) => asset.id === assetId) || null);
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
        return;
      }
      if (event.key !== "Enter") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target === searchInput || target?.closest?.("[data-tool-asset-audio]")) return;
      const item = target?.closest?.("[data-tool-asset-id]");
      if (!item) return;
      const isAudioItem = item.classList.contains("is-audio");
      if (isAudioItem && !target?.closest?.("[data-tool-asset-select]") && target !== item) return;
      event.preventDefault();
      const assetId = item.dataset.toolAssetId || "";
      if (multiple) toggleAssetSelection(item, assetId);
      else close(assets.find((asset) => asset.id === assetId) || null);
    });

    searchInput?.addEventListener("input", renderGrid);

    (typeof options.loadAssets === "function"
      ? Promise.resolve(options.loadAssets({ type }))
      : Promise.resolve(options.assets || []))
      .then((result) => {
        const provided = Array.isArray(result) ? result : result?.assets;
        const providedFolders = Array.isArray(result?.folders) ? result.folders : [];
        assets = dedupeAssets((Array.isArray(provided) ? provided : [])
          .map((asset) => normalizePickerAsset(asset, asset?.scope || "personal"))
          .filter((asset) => asset && asset.type === type));
        folders = providedFolders.length
          ? normalizePickerFolders(providedFolders)
          : buildFoldersFromAssetCategories(assets);
        const availableScopes = ["system", "personal"].filter((scope) =>
          assets.some((asset) => asset.scope === scope) || folders.some((folder) => folder.scope === scope)
        );
        selectedScope = availableScopes.includes("system") ? "system" : (availableScopes[0] || "system");
        currentFolderId = null;
        renderNavigation();
      })
      .catch((error) => {
        console.warn("[asset-picker] Impossible de charger les ressources.", error);
        assets = [];
        folders = [];
        renderScopes();
        renderBreadcrumb();
        if (status) {
          status.textContent = error?.message || "Impossible de charger les ressources.";
          status.classList.add("is-error");
        }
        if (grid) grid.innerHTML = "";
      });

    window.requestAnimationFrame(() => searchInput?.focus());
  });
}

function normalizePickerAsset(asset, defaultScope = "system") {
  if (!asset || typeof asset !== "object") return null;
  const id = String(asset.id || asset.resourceId || asset.resource_id || "").trim();
  const type = String(asset.type || "image").trim().toLowerCase();
  const src = String(asset.url || asset.src || "").trim();
  if (!id || !src) return null;
  const label = String(asset.label || asset.title || asset.name || id).trim() || id;
  const tags = Array.isArray(asset.tags) ? asset.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
  const scope = String(asset.scope || defaultScope).trim().toLowerCase() === "personal" ? "personal" : "system";
  const folderId = String(asset.folderId || asset.folder_id || "").trim() || null;
  let folderPath = String(asset.folderPath || asset.folder_path || asset.category || "").trim();
  // Compatibilité avec les anciens chargeurs du Quiz : leur catégorie
  // commençait par un faux dossier « Ressources système/personnelles ».
  // Les onglets du picker portent désormais ce niveau, on le retire donc.
  const legacyRoot = scope === "personal" ? "Ressources personnelles" : "Ressources système";
  if (folderPath === legacyRoot) folderPath = "";
  else if (folderPath.startsWith(`${legacyRoot} / `)) folderPath = folderPath.slice(legacyRoot.length + 3).trim();
  return {
    ...asset,
    id,
    type,
    src,
    url: src,
    label,
    alt: String(asset.alt || label).trim() || label,
    tags,
    scope,
    folderId,
    folderPath,
    display_order:Number.isFinite(Number(asset.display_order)) ? Number(asset.display_order) : 0,
    searchableText: normalizeSearchText([id, label, asset.alt, folderPath, ...tags].join(" "))
  };
}

function normalizePickerFolders(rawFolders = []) {
  return (Array.isArray(rawFolders) ? rawFolders : [])
    .map((folder, index) => {
      const id = String(folder?.id || "").trim();
      if (!id) return null;
      return {
        id,
        parentId:String(folder?.parentId || folder?.parent_id || "").trim() || null,
        label:String(folder?.label || folder?.name || "Dossier").trim() || "Dossier",
        scope:String(folder?.scope || "system").trim().toLowerCase() === "personal" ? "personal" : "system",
        display_order:Number.isFinite(Number(folder?.display_order)) ? Number(folder.display_order) : index
      };
    })
    .filter(Boolean);
}

function buildFoldersFromAssetCategories(assets = []) {
  const folders = [];
  const known = new Map();
  for (const asset of assets) {
    const parts = String(asset.folderPath || "").split("/").map((part) => part.trim()).filter(Boolean);
    let parentId = null;
    let path = "";
    for (const part of parts) {
      path = path ? `${path} / ${part}` : part;
      const key = `${asset.scope}:${path}`;
      let folder = known.get(key);
      if (!folder) {
        folder = {
          id:`legacy:${asset.scope}:${normalizeSearchText(path).replaceAll(" ", "-") || folders.length}`,
          parentId,
          label:part,
          scope:asset.scope,
          display_order:folders.length
        };
        known.set(key, folder);
        folders.push(folder);
      }
      parentId = folder.id;
    }
    if (!asset.folderId) asset.folderId = parentId;
  }
  return folders;
}

function dedupeAssets(assets) {
  const seen = new Set();
  return assets.filter((asset) => {
    const key = `${asset.scope}:${asset.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isFolderDescendantOrSelf(candidateFolderId, ancestorFolderId, folders = []) {
  if (!ancestorFolderId) return true;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let cursorId = String(candidateFolderId || "");
  const visited = new Set();
  while (cursorId && !visited.has(cursorId)) {
    if (cursorId === String(ancestorFolderId)) return true;
    visited.add(cursorId);
    cursorId = String(byId.get(cursorId)?.parentId || "");
  }
  return false;
}

function compareByOrderThenLabel(first, second) {
  const delta = (Number(first?.display_order) || 0) - (Number(second?.display_order) || 0);
  if (delta) return delta;
  return String(first?.label || "").localeCompare(String(second?.label || ""), "fr", { sensitivity:"base" });
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
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function createPickerSearchMatcher(query) {
  if (!query.includes("*")) return (asset) => asset.searchableText.includes(query);
  const patterns = query.split(" ").map((pattern) => pattern.replace(/\*+/g, "*").split("*"));
  return (asset) => {
    // Les jokers cherchent des mots du nom, sans correspondances parasites
    // avec les identifiants techniques ou les noms de dossiers.
    const words = normalizeSearchText(asset.label, { preserveAccents:true }).split(" ");
    return patterns.every((parts) => words.some((word) => matchesWildcardWord(word, parts)));
  };
}

function matchesWildcardWord(word, parts) {
  if (!word.startsWith(parts[0])) return false;
  const interiorOnly = parts.length > 2 && parts[0] === "" && parts[parts.length - 1] === "";
  let offset = parts[0].length;
  for (let index = 1; index < parts.length; index += 1) {
    // Avec un joker aux deux extrémités, garder au moins un caractère
    // de chaque côté : *a* cherche un a à l’intérieur du mot.
    const minimumStart = offset + (interiorOnly && (index === 1 || index === parts.length - 1) ? 1 : 0);
    const part = parts[index];
    if (index === parts.length - 1) {
      return word.endsWith(part) && word.length - part.length >= minimumStart;
    }
    const start = word.indexOf(part, minimumStart);
    if (start < 0) return false;
    offset = start + part.length;
  }
  return offset === word.length;
}

function normalizePickerSearchQuery(value) {
  return normalizeSearchText(value, {
    preserveWildcards:true,
    preserveAccents:String(value || "").includes("*")
  });
}

function normalizeSearchText(value, { preserveWildcards = false, preserveAccents = false } = {}) {
  let text = String(value || "").normalize("NFC").toLowerCase();
  if (!preserveAccents) text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nonSearchCharacters = preserveAccents
    ? (preserveWildcards ? /[^\p{L}\p{N}*]+/gu : /[^\p{L}\p{N}]+/gu)
    : (preserveWildcards ? /[^a-z0-9*]+/g : /[^a-z0-9]+/g);
  return text
    .replace(/[’']/g, " ")
    .replace(nonSearchCharacters, " ")
    .trim();
}
