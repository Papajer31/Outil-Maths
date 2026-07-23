import { listToolAssets } from "./tool-assets.js";
import { formatToolAssetCategory } from "./labels.js";

let activePicker = null;

export async function openToolAssetPicker(options = {}) {
  if (activePicker?.close) activePicker.close(null);

  const type = String(options.type || "image").trim().toLowerCase() || "image";
  const title = String(options.title || "Choisir une image").trim();
  const emptyMessage = String(options.emptyMessage || "Aucune ressource disponible.").trim();
  const includeDefaultAssets = options.includeDefaultAssets !== false;

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
        </div>
        <div class="tool-asset-picker-controls">
          <div class="tool-asset-picker-scopes" role="tablist" aria-label="Origine des ressources"></div>
          <label class="tool-asset-picker-search">
            <svg class="tool-asset-picker-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9.8 4.5a5.3 5.3 0 1 1 0 10.6 5.3 5.3 0 0 1 0-10.6Zm0-2a7.3 7.3 0 1 0 4.55 13.01l4.07 4.07a1 1 0 0 0 1.41-1.41l-4.07-4.07A7.3 7.3 0 0 0 9.8 2.5Z" fill="currentColor"/>
            </svg>
            <input class="tool-asset-picker-search-input" type="search" placeholder="Rechercher…" autocomplete="off">
          </label>
        </div>
        <div class="tool-asset-picker-body">
          <nav class="tool-asset-picker-folders" aria-label="Dossiers de ressources"></nav>
          <section class="tool-asset-picker-main" aria-label="Images disponibles">
            <div class="tool-asset-picker-status" aria-live="polite">Chargement des ressources…</div>
            <div class="tool-asset-picker-grid" role="listbox" aria-label="Images disponibles"></div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const searchInput = overlay.querySelector(".tool-asset-picker-search-input");
    const scopes = overlay.querySelector(".tool-asset-picker-scopes");
    const folders = overlay.querySelector(".tool-asset-picker-folders");
    const status = overlay.querySelector(".tool-asset-picker-status");
    const grid = overlay.querySelector(".tool-asset-picker-grid");

    let assets = [];
    let selectedScope = "system";
    let selectedCategory = "";
    const collapsedCategoryPaths = new Set();
    let closed = false;

    const close = (asset) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      activePicker = null;
      resolve(asset || null);
    };

    activePicker = { close };

    const getScopeAssets = () => assets.filter((asset) => asset.scope === selectedScope);

    const getCategories = () => {
      const counts = new Map();
      for (const asset of getScopeAssets()) {
        const category = String(asset.category || "Sans dossier").trim() || "Sans dossier";
        counts.set(category, (counts.get(category) || 0) + 1);
      }
      return Array.from(counts, ([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    };

    const renderScopes = () => {
      if (!scopes) return;
      const available = [
        { id: "personal", label: "Personnelles" },
        { id: "system", label: "Système" }
      ].filter((scope) => assets.some((asset) => asset.scope === scope.id));

      scopes.classList.toggle("is-hidden", available.length < 2);
      scopes.innerHTML = available.map((scope) => {
        const count = assets.filter((asset) => asset.scope === scope.id).length;
        return `
          <button
            class="tool-asset-picker-scope${scope.id === selectedScope ? " is-active" : ""}"
            type="button"
            role="tab"
            data-tool-asset-scope="${escapeAttr(scope.id)}"
            aria-selected="${scope.id === selectedScope ? "true" : "false"}"
          >
            <span>${escapeHtml(scope.label)}</span>
            <span class="tool-asset-picker-scope-count">${count}</span>
          </button>
        `;
      }).join("");
    };

    const renderCategoryTreeNode = (node, depth) => {
      if (!node.path) {
        return `
          <div class="tool-asset-picker-tree-row tool-asset-picker-tree-row--root">
            <button
              class="tool-asset-picker-folder${selectedCategory === "" ? " is-active" : ""}"
              type="button"
              data-tool-asset-category=""
              aria-pressed="${selectedCategory === "" ? "true" : "false"}"
            >
              <svg class="tool-asset-picker-folder-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 3.2 3.8 9.8v10.4h5.7v-6.3h5v6.3h5.7V9.8L12 3.2Zm0 2.57 6.2 5v7.43h-1.7v-6.3H7.5v6.3H5.8v-7.43l6.2-5Z" fill="currentColor"/>
              </svg>
              <span class="tool-asset-picker-folder-label">Toutes les ressources</span>
              <span class="tool-asset-picker-folder-count">${node.count}</span>
            </button>
          </div>
          ${node.children.map((child) => renderCategoryTreeNode(child, depth + 1)).join("")}
        `;
      }

      const hasChildren = node.children.length > 0;
      const isCollapsed = collapsedCategoryPaths.has(node.path);
      const label = selectedScope === "system" ? formatToolAssetCategory(node.label) : node.label;
      const indicatorPath = isCollapsed
        ? "M9.29 6.71a1 1 0 0 0 0 1.41L13.59 12l-4.3 3.88a1 1 0 1 0 1.34 1.48l5.12-4.62a1 1 0 0 0 0-1.48L10.63 6.7a1 1 0 0 0-1.34.01Z"
        : "M7.41 8.59a1 1 0 0 0 0 1.41l3.88 3.88a1 1 0 0 0 1.42 0L16.59 10a1 1 0 1 0-1.42-1.41L12 11.76 8.83 8.59a1 1 0 0 0-1.42 0Z";
      return `
        <div class="tool-asset-picker-tree-row" style="--tool-asset-tree-depth:${depth}" ${hasChildren ? `data-tool-asset-category-branch-path="${escapeAttr(node.path)}"` : ""}>
          ${hasChildren ? `
            <span class="tool-asset-picker-tree-indicator" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path d="${indicatorPath}" fill="currentColor"/></svg>
            </span>
          ` : '<span class="tool-asset-picker-tree-spacer" aria-hidden="true"></span>'}
          <button
            class="tool-asset-picker-folder${selectedCategory === node.path ? " is-active" : ""}"
            type="button"
            data-tool-asset-category="${escapeAttr(node.path)}"
            data-tool-asset-category-branch="${hasChildren ? "true" : "false"}"
            aria-pressed="${selectedCategory === node.path ? "true" : "false"}"
            ${hasChildren ? `aria-expanded="${isCollapsed ? "false" : "true"}"` : ""}
          >
            <svg class="tool-asset-picker-folder-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M3.8 6.2c0-1.1.9-2 2-2h4.45c.55 0 1.08.23 1.46.64l1.13 1.21h5.36c1.1 0 2 .9 2 2v9.75c0 1.1-.9 2-2 2H5.8c-1.1 0-2-.9-2-2V6.2Zm2 .05v11.55h12.4V8.05h-6.23L10.25 6.25H5.8Z" fill="currentColor"/>
            </svg>
            <span class="tool-asset-picker-folder-label">${escapeHtml(label)}</span>
            <span class="tool-asset-picker-folder-count">${node.count}</span>
          </button>
        </div>
        ${hasChildren && !isCollapsed ? node.children.map((child) => renderCategoryTreeNode(child, depth + 1)).join("") : ""}
      `;
    };

    const renderFolders = () => {
      if (!folders) return;
      const tree = buildCategoryTree(getCategories());
      const total = getScopeAssets().length;
      folders.innerHTML = `
        <div class="tool-asset-picker-tree">
          ${renderCategoryTreeNode({ path:"", label:"Toutes les ressources", count:total, children:tree }, 0)}
        </div>
      `;
    };

    const getFilteredAssets = () => {
      const query = normalizeSearchText(searchInput?.value || "");
      return getScopeAssets().filter((asset) => {
        const assetCategory = String(asset.category || "Sans dossier").trim() || "Sans dossier";
        if (selectedCategory && assetCategory !== selectedCategory && !assetCategory.startsWith(`${selectedCategory} /`)) return false;
        if (!query) return true;
        return asset.searchableText.includes(query);
      });
    };

    const renderGrid = () => {
      if (!grid || !status) return;
      const filtered = getFilteredAssets();
      const categoryLabel = selectedCategory
        ? (selectedScope === "system" ? formatToolAssetCategory(selectedCategory) : selectedCategory)
        : "Toutes";
      status.textContent = filtered.length
        ? `${categoryLabel} · ${filtered.length} image${filtered.length > 1 ? "s" : ""}`
        : emptyMessage;
      status.classList.toggle("is-empty", filtered.length === 0);

      grid.innerHTML = filtered.map((asset) => `
        <button
          class="tool-asset-picker-item"
          type="button"
          role="option"
          data-tool-asset-id="${escapeAttr(asset.id)}"
          title="${escapeAttr(asset.label || asset.id)}"
        >
          <img class="tool-asset-picker-image" src="${escapeAttr(asset.url || asset.src)}" alt="${escapeAttr(asset.alt || asset.label || asset.id)}" decoding="async">
          <span class="tool-asset-picker-label">${escapeHtml(asset.label || asset.id)}</span>
        </button>
      `).join("");
    };

    const refresh = () => {
      renderScopes();
      renderFolders();
      renderGrid();
    };

    overlay.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target === overlay) {
        close(null);
        return;
      }

      const scopeButton = target.closest("[data-tool-asset-scope]");
      if (scopeButton && scopes?.contains(scopeButton)) {
        selectedScope = scopeButton.dataset.toolAssetScope || "system";
        selectedCategory = "";
        refresh();
        return;
      }

      const folder = target.closest("[data-tool-asset-category]");
      if (folder && folders?.contains(folder)) {
        const path = folder.dataset.toolAssetCategory || "";
        if (folder.dataset.toolAssetCategoryBranch === "true") {
          if (collapsedCategoryPaths.has(path)) collapsedCategoryPaths.delete(path);
          else collapsedCategoryPaths.add(path);
          renderFolders();
          return;
        }
        selectedCategory = path;
        refresh();
        return;
      }

      const branchRow = target.closest("[data-tool-asset-category-branch-path]");
      if (branchRow && folders?.contains(branchRow)) {
        const path = branchRow.dataset.toolAssetCategoryBranchPath || "";
        if (collapsedCategoryPaths.has(path)) collapsedCategoryPaths.delete(path);
        else collapsedCategoryPaths.add(path);
        renderFolders();
        return;
      }

      const item = target.closest("[data-tool-asset-id]");
      if (item && grid?.contains(item)) {
        const assetId = item.dataset.toolAssetId || "";
        close(assets.find((asset) => asset.id === assetId) || null);
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
        return;
      }
      if (event.key === "Enter") {
        const target = event.target instanceof Element ? event.target : null;
        const item = target?.closest?.("[data-tool-asset-id]");
        if (item) {
          event.preventDefault();
          const assetId = item.dataset.toolAssetId || "";
          close(assets.find((asset) => asset.id === assetId) || null);
        }
      }
    });

    searchInput?.addEventListener("input", renderGrid);

    Promise.all([
      includeDefaultAssets ? listToolAssets({ type }) : Promise.resolve([]),
      typeof options.loadAssets === "function"
        ? Promise.resolve(options.loadAssets({ type }))
        : Promise.resolve(options.assets || [])
    ])
      .then(([defaultAssets, extraAssets]) => {
        const systemAssets = (Array.isArray(defaultAssets) ? defaultAssets : [])
          .map((asset) => normalizePickerAsset(asset, "system"))
          .filter(Boolean);
        const providedAssets = (Array.isArray(extraAssets) ? extraAssets : [])
          .map((asset) => normalizePickerAsset(asset, asset?.scope || "personal"))
          .filter((asset) => asset && asset.type === type);
        assets = dedupeAssets([...providedAssets, ...systemAssets]);
        selectedScope = assets.some((asset) => asset.scope === "personal") ? "personal" : "system";
        selectedCategory = "";
        refresh();
      })
      .catch((error) => {
        console.warn("[asset-picker] Impossible de charger les ressources.", error);
        assets = [];
        selectedCategory = "";
        renderScopes();
        renderFolders();
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
  const category = String(asset.category || asset.folderPath || asset.folder_path || "Sans dossier").trim() || "Sans dossier";
  const tags = Array.isArray(asset.tags) ? asset.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
  const scope = String(asset.scope || defaultScope).trim().toLowerCase() === "personal" ? "personal" : "system";
  return {
    ...asset,
    id,
    type,
    src,
    url: src,
    label,
    alt: String(asset.alt || label).trim() || label,
    category,
    tags,
    scope,
    searchableText: normalizeSearchText([id, label, asset.alt, category, ...tags].join(" "))
  };
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

function buildCategoryTree(categories = []) {
  const roots = [];
  const nodesByPath = new Map();

  (Array.isArray(categories) ? categories : []).forEach(({ name, count }) => {
    const parts = String(name || "").split("/").map((part) => part.trim()).filter(Boolean);
    let parentChildren = roots;
    let path = "";
    parts.forEach((label) => {
      path = path ? `${path} / ${label}` : label;
      let node = nodesByPath.get(path);
      if (!node) {
        node = { path, label, count:0, children:[] };
        nodesByPath.set(path, node);
        parentChildren.push(node);
      }
      node.count += Number(count) || 0;
      parentChildren = node.children;
    });
  });

  const sortNodes = (nodes) => nodes
    .sort((first, second) => first.label.localeCompare(second.label, "fr"))
    .map((node) => ({ ...node, children:sortNodes(node.children) }));
  return sortNodes(roots);
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

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
