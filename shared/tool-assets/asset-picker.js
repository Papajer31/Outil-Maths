import { listToolAssets } from "./tool-assets.js";

let activePicker = null;

export async function openToolAssetPicker(options = {}) {
  if (activePicker?.close) {
    activePicker.close(null);
  }

  const type = String(options.type || "image").trim().toLowerCase() || "image";
  const title = String(options.title || "Choisir une image").trim();
  const emptyMessage = String(options.emptyMessage || "Aucun asset disponible.").trim();

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
            <div class="tool-asset-picker-kicker">Assets du site</div>
            <div class="tool-asset-picker-title">${escapeHtml(title)}</div>
          </div>
        </div>
        <div class="tool-asset-picker-controls">
          <label class="tool-asset-picker-search">
            <svg class="tool-asset-picker-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9.8 4.5a5.3 5.3 0 1 1 0 10.6 5.3 5.3 0 0 1 0-10.6Zm0-2a7.3 7.3 0 1 0 4.55 13.01l4.07 4.07a1 1 0 0 0 1.41-1.41l-4.07-4.07A7.3 7.3 0 0 0 9.8 2.5Z" fill="currentColor"/>
            </svg>
            <input class="tool-asset-picker-search-input" type="search" placeholder="Rechercher…" autocomplete="off">
          </label>
        </div>
        <div class="tool-asset-picker-body">
          <nav class="tool-asset-picker-folders" aria-label="Catégories d’assets"></nav>
          <section class="tool-asset-picker-main" aria-label="Images disponibles">
            <div class="tool-asset-picker-status" aria-live="polite">Chargement des assets…</div>
            <div class="tool-asset-picker-grid" role="listbox" aria-label="Images disponibles"></div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const searchInput = overlay.querySelector(".tool-asset-picker-search-input");
    const folders = overlay.querySelector(".tool-asset-picker-folders");
    const status = overlay.querySelector(".tool-asset-picker-status");
    const grid = overlay.querySelector(".tool-asset-picker-grid");

    let assets = [];
    let selectedCategory = "";
    let closed = false;

    const close = (asset) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      activePicker = null;
      resolve(asset || null);
    };

    activePicker = { close };

    const getCategories = () => {
      const counts = new Map();
      for (const asset of assets) {
        const category = String(asset.category || "Sans catégorie").trim() || "Sans catégorie";
        counts.set(category, (counts.get(category) || 0) + 1);
      }
      return Array.from(counts, ([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    };

    const renderFolders = () => {
      if (!folders) return;
      const categories = getCategories();
      const total = assets.length;
      const buttons = [
        { name: "", label: "Toutes", count: total },
        ...categories.map((category) => ({
          name: category.name,
          label: formatCategoryLabel(category.name),
          count: category.count
        }))
      ];

      folders.innerHTML = buttons.map((button) => `
        <button
          class="tool-asset-picker-folder${button.name === selectedCategory ? " is-active" : ""}"
          type="button"
          data-tool-asset-category="${escapeAttr(button.name)}"
          aria-pressed="${button.name === selectedCategory ? "true" : "false"}"
        >
          <svg class="tool-asset-picker-folder-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M3.8 6.2c0-1.1.9-2 2-2h4.45c.55 0 1.08.23 1.46.64l1.13 1.21h5.36c1.1 0 2 .9 2 2v9.75c0 1.1-.9 2-2 2H5.8c-1.1 0-2-.9-2-2V6.2Zm2 .05v11.55h12.4V8.05h-6.23L10.25 6.25H5.8Z" fill="currentColor"/>
          </svg>
          <span class="tool-asset-picker-folder-label">${escapeHtml(button.label)}</span>
          <span class="tool-asset-picker-folder-count">${button.count}</span>
        </button>
      `).join("");
    };

    const getFilteredAssets = () => {
      const query = normalizeSearchText(searchInput?.value || "");
      return assets.filter((asset) => {
        const assetCategory = String(asset.category || "Sans catégorie").trim() || "Sans catégorie";
        if (selectedCategory && assetCategory !== selectedCategory) return false;
        if (!query) return true;
        const text = asset.searchableText || normalizeSearchText([
          asset.id,
          asset.label,
          asset.alt,
          asset.category,
          ...(Array.isArray(asset.tags) ? asset.tags : [])
        ].join(" "));
        return text.includes(query);
      });
    };

    const renderGrid = () => {
      if (!grid || !status) return;
      const filtered = getFilteredAssets();
      const categoryLabel = selectedCategory ? formatCategoryLabel(selectedCategory) : "Toutes";
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
          title="${escapeAttr(`${asset.label || asset.id} · ${asset.id}`)}"
        >
          <img class="tool-asset-picker-image" src="${escapeAttr(asset.url || asset.src)}" alt="${escapeAttr(asset.alt || asset.label || asset.id)}" decoding="async">
          <span class="tool-asset-picker-label">${escapeHtml(asset.label || asset.id)}</span>
        </button>
      `).join("");
    };

    const refresh = () => {
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

      const folder = target.closest("[data-tool-asset-category]");
      if (folder && folders?.contains(folder)) {
        selectedCategory = folder.dataset.toolAssetCategory || "";
        refresh();
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

    listToolAssets({ type })
      .then((result) => {
        assets = Array.isArray(result) ? result : [];
        selectedCategory = "";
        refresh();
      })
      .catch((error) => {
        console.warn("[asset-picker] Impossible de charger les assets.", error);
        assets = [];
        selectedCategory = "";
        renderFolders();
        if (status) {
          status.textContent = "Impossible de charger les assets.";
          status.classList.add("is-error");
        }
        if (grid) grid.innerHTML = "";
      });

    window.requestAnimationFrame(() => searchInput?.focus());
  });
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

function formatCategoryLabel(category) {
  return String(category || "Sans catégorie")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/[-_]+/g, " "))
    .join(" / ") || "Sans catégorie";
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
