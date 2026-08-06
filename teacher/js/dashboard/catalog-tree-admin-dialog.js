import {
  PEDAGOGICAL_GRADE_LEVELS,
  normalizeCatalogGradeLevel,
  normalizePedagogicalNode,
  sortPedagogicalNodes
} from "../../../shared/catalogue.js";
import { renderMaterialIcon } from "../../../shared/material-icons-svg.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const TYPE_META = Object.freeze({
  discipline: { label: "Discipline", childType: "domain", icon: "school" },
  domain: { label: "Domaine", childType: "theme", icon: "menu_book" },
  theme: { label: "Thème", childType: "learning_objective", icon: "account_tree" },
  learning_objective: { label: "Objectif d’apprentissage", childType: "grade_level", icon: "target" },
  grade_level: { label: "Dossier de niveau", childType: "", icon: "class" }
});
const TREE_ROW_HEIGHT = 54;
const TREE_OVERSCAN = 8;

function renderIcon(name) {
  return renderMaterialIcon(name, { className: "dashboard-material-icon" });
}

export function openCatalogTreeAdminDialog({
  folders: initialFolders = [],
  activities = [],
  listPedagogicalNodesForAdmin,
  createPedagogicalNodeAsAdmin,
  updatePedagogicalNodeAsAdmin,
  deletePedagogicalNodeAsAdmin,
  showToast
} = {}) {
  return new Promise((resolve) => {
    let folders = sortPedagogicalNodes(initialFolders);
    let selectedId = folders[0]?.id || "";
    let draft = null;
    let changed = false;
    let busy = false;
    let folderById = new Map();
    let childrenByParentId = new Map();
    let visibleTreeNodes = [];
    let treeRenderFrame = 0;
    let treeRenderToken = 0;
    let treeWindowStart = -1;
    let treeWindowEnd = -1;

    const overlay = document.createElement("div");
    overlay.className = "modal catalog-tree-admin-modal";
    overlay.setAttribute("aria-hidden", "false");
    overlay.innerHTML = `
      <div class="modal-content catalog-tree-admin-card" role="dialog" aria-modal="true" aria-labelledby="catalogTreeAdminTitle">
        <div class="catalog-tree-admin-header">
          <div>
            <div id="catalogTreeAdminTitle" class="modal-title">Arborescence pédagogique</div>
            <div class="catalog-tree-admin-subtitle">Discipline, domaine, thème et objectif d’apprentissage. Les niveaux associés apparaissent dans le panneau de droite.</div>
          </div>
          <div class="catalog-tree-admin-header-actions">
            <button class="btn dashboard-btn-with-icon" type="button" data-action="export-tree" title="Exporter l’arborescence au format texte">
              ${renderIcon("download")}
              <span>Exporter</span>
            </button>
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="close" title="Fermer" aria-label="Fermer">
              ${renderIcon("close")}
            </button>
          </div>
        </div>
        <div class="catalog-tree-admin-layout">
          <section class="catalog-tree-admin-tree-panel">
            <div class="catalog-tree-admin-panel-head">
              <strong>Nœuds pédagogiques</strong>
              <button class="btn primary dashboard-btn-with-icon" type="button" data-action="create-root">
                ${renderIcon("add")}
                Discipline
              </button>
            </div>
            <div class="catalog-tree-admin-tree" data-role="tree"></div>
          </section>
          <section class="catalog-tree-admin-editor" data-role="editor"></section>
        </div>
        <div class="modal-actions catalog-tree-admin-footer">
          <div class="modal-message" data-role="message"></div>
          <div class="catalog-tree-admin-summary" data-role="summary"></div>
          <button class="btn dashboard-btn-with-icon" type="button" data-action="close">${renderIcon("close")}<span>Fermer</span></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const treeHost = overlay.querySelector("[data-role='tree']");
    const editorHost = overlay.querySelector("[data-role='editor']");
    const messageHost = overlay.querySelector("[data-role='message']");
    const summaryHost = overlay.querySelector("[data-role='summary']");

    let closed = false;
    let exportOverlay = null;
    let closeExportOverlay = () => {};
    const onKeydown = (event) => {
      if (event.key === "Escape" && overlay.isConnected) close();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeydown);
      closeExportOverlay();
      overlay.remove();
      resolve({ changed, folders });
    };

    overlay.querySelectorAll("[data-action='close']").forEach((button) => button.addEventListener("click", close));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener("keydown", onKeydown);

    overlay.querySelector("[data-action='create-root']")?.addEventListener("click", () => {
      draft = buildDraft(null);
      selectedId = "";
      render();
    });
    overlay.querySelector("[data-action='export-tree']")?.addEventListener("click", () => {
      openTreeExportOverlay();
    });

    treeHost?.addEventListener("scroll", () => renderTreeWindow(), { passive:true });
    treeHost?.addEventListener("click", (event) => {
      const moveButton = event.target?.closest?.("[data-action='move-up'], [data-action='move-down']");
      if (moveButton && treeHost.contains(moveButton)) {
        event.stopPropagation();
        void moveSibling(String(moveButton.dataset.folderId || ""), moveButton.dataset.action === "move-up" ? -1 : 1);
        return;
      }
      const folderButton = event.target?.closest?.("[data-folder-id]");
      if (!folderButton || !treeHost.contains(folderButton)) return;
      selectedId = String(folderButton.dataset.folderId || "");
      draft = null;
      render();
    });

    function render() {
      renderTree();
      renderEditor();
      renderSummary();
    }

    function renderSummary() {
      if (!summaryHost) return;
      const counts = folders.reduce((total, folder) => {
        if (Object.hasOwn(total, folder?.node_type)) total[folder.node_type] += 1;
        return total;
      }, { discipline: 0, domain: 0, theme: 0, learning_objective: 0 });
      summaryHost.textContent = `Total : ${counts.discipline} disciplines, ${counts.domain} domaines, ${counts.theme} thèmes et ${counts.learning_objective} objectifs d’apprentissage`;
    }

    function renderTree() {
      if (treeRenderFrame) {
        cancelAnimationFrame(treeRenderFrame);
        treeRenderFrame = 0;
      }
      visibleTreeNodes = buildVisibleTreeNodes();
      treeRenderToken += 1;
      treeWindowStart = -1;
      treeWindowEnd = -1;
      if (!visibleTreeNodes.length) {
        treeHost.innerHTML = `<div class="dashboard-activity-empty-state">Aucune discipline.</div>`;
        return;
      }
      treeHost.innerHTML = `
        <div class="catalog-tree-admin-virtual-spacer" style="height:${visibleTreeNodes.length * TREE_ROW_HEIGHT}px" data-role="tree-spacer">
          <div class="catalog-tree-admin-virtual-rows" data-role="tree-rows"></div>
        </div>
      `;
      renderTreeWindow({ force:true });
    }

    function buildVisibleTreeNodes() {
      const nodes = [];
      const visit = (parentId, depth, ancestry = new Set()) => {
        getChildren(parentId).forEach((folder) => {
          const id = String(folder?.id || "");
          if (!id || ancestry.has(id)) return;
          if (folder.node_type === "grade_level") return;
          nodes.push({ folder, depth });
          const nextAncestry = new Set(ancestry);
          nextAncestry.add(id);
          visit(id, depth + 1, nextAncestry);
        });
      };
      visit(null, 0);
      return nodes;
    }

    function renderTreeWindow({ force = false } = {}) {
      if (!treeHost || treeRenderFrame) return;
      const token = treeRenderToken;
      treeRenderFrame = requestAnimationFrame(() => {
        treeRenderFrame = 0;
        if (!treeHost.isConnected || token !== treeRenderToken || !visibleTreeNodes.length) return;
        const viewportHeight = Math.max(treeHost.clientHeight || 0, TREE_ROW_HEIGHT * 8);
        const visibleCount = Math.ceil(viewportHeight / TREE_ROW_HEIGHT);
        const start = Math.max(0, Math.floor(treeHost.scrollTop / TREE_ROW_HEIGHT) - TREE_OVERSCAN);
        const end = Math.min(visibleTreeNodes.length, start + visibleCount + (TREE_OVERSCAN * 2));
        if (!force && start === treeWindowStart && end === treeWindowEnd) return;
        const rows = treeHost.querySelector("[data-role='tree-rows']");
        if (!rows) return;
        rows.style.transform = `translateY(${start * TREE_ROW_HEIGHT}px)`;
        rows.innerHTML = visibleTreeNodes
          .slice(start, end)
          .map(({ folder, depth }) => renderTreeNode(folder, depth))
          .join("");
        treeWindowStart = start;
        treeWindowEnd = end;
      });
    }

    function renderTreeNode(folder, depth) {
      const selected = !draft && selectedId === folder.id;
      const meta = TYPE_META[folder.node_type] || TYPE_META.domain;
      return `
        <div class="catalog-tree-admin-node${folder.is_active ? "" : " is-inactive"}" style="--tree-depth:${depth};">
          <button class="catalog-tree-admin-node-main${selected ? " is-selected" : ""}" type="button" data-folder-id="${escapeAttr(folder.id)}">
            ${renderIcon(meta.icon)}
            <span class="catalog-tree-admin-node-copy">
              <strong>${escapeHtml(folder.name)}</strong>
              <small>${escapeHtml(meta.label)}${folder.is_active ? "" : " · Désactivé"}</small>
            </span>
          </button>
          <span class="catalog-tree-admin-node-order">
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-up" data-folder-id="${escapeAttr(folder.id)}" title="Monter" aria-label="Monter">${renderIcon("arrow_upward")}</button>
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-down" data-folder-id="${escapeAttr(folder.id)}" title="Descendre" aria-label="Descendre">${renderIcon("arrow_downward")}</button>
          </span>
        </div>
      `;
    }

    function renderEditor() {
      if (draft) {
        renderForm(draft, { isNew: true });
        return;
      }
      const folder = getFolder(selectedId);
      if (!folder) {
        editorHost.innerHTML = `
          <div class="catalog-tree-admin-editor-empty">
            ${renderIcon("account_tree")}
            <strong>Sélectionne un nœud</strong>
            <p>Tu pourras le renommer, le déplacer ou créer son enfant pédagogique.</p>
          </div>`;
        return;
      }
      renderForm({ ...folder }, { isNew: false });
    }

    function renderForm(model, { isNew }) {
      const typeMeta = TYPE_META[model.node_type] || TYPE_META.domain;
      const parentCandidates = getParentCandidates(model);
      const childType = typeMeta.childType;
      const childCount = folders.filter((folder) => folder.parent_id === model.id).length;
      const gradeChildren = model.node_type === "learning_objective"
        ? getChildren(model.id).filter((folder) => folder.node_type === "grade_level")
        : [];
      const nonGradeChildCount = model.node_type === "learning_objective"
        ? childCount - gradeChildren.length
        : childCount;
      const canCreateChild = Boolean(childType) && !(
        childType === "grade_level"
        && getChildren(model.id).filter((folder) => folder.node_type === "grade_level").length >= PEDAGOGICAL_GRADE_LEVELS.length
      );
      const activityCount = activities.filter((activity) => String(activity?.pedagogical_node_id || activity?.folder_id || "") === model.id).length;
      const gradeActivityCount = gradeChildren.length
        ? activities.filter((activity) => gradeChildren.some((gradeFolder) => String(activity?.pedagogical_node_id || activity?.folder_id || "") === String(gradeFolder.id))).length
        : 0;
      const deleteDisabled = nonGradeChildCount > 0 || activityCount > 0 || gradeActivityCount > 0;
      const siblingGrades = new Set(
        getChildren(model.parent_id)
          .filter((folder) => folder.id !== model.id && folder.node_type === "grade_level")
          .map((folder) => normalizeCatalogGradeLevel(folder.name))
          .filter(Boolean)
      );
      const availableGrades = PEDAGOGICAL_GRADE_LEVELS.filter((grade) => (
        grade === normalizeCatalogGradeLevel(model.name) || !siblingGrades.has(grade)
      ));
      const nameField = model.node_type === "grade_level"
        ? `
          <label class="catalog-tree-admin-field">
            <span>Niveau</span>
            <select class="student-select" data-field="name">
              ${availableGrades.map((grade) => `<option value="${grade}" ${normalizeCatalogGradeLevel(model.name) === grade ? "selected" : ""}>${grade}</option>`).join("")}
            </select>
          </label>`
        : `
          <label class="catalog-tree-admin-field">
            <span>Nom</span>
            <input class="modal-text-input" type="text" data-field="name" value="${escapeAttr(model.name || "")}" maxlength="120" />
          </label>`;
      const gradesField = model.node_type === "learning_objective"
        ? `
          <div class="catalog-tree-admin-field">
            <span>Niveaux associés</span>
            <div class="catalog-tree-admin-grades catalog-tree-admin-objective-grades">
              ${gradeChildren.length
                ? gradeChildren.map((gradeFolder) => `
                  <button class="catalog-tree-admin-grade-badge" type="button" data-action="select-grade-folder" data-folder-id="${escapeAttr(gradeFolder.id)}" title="Modifier le dossier ${escapeAttr(normalizeCatalogGradeLevel(gradeFolder.name) || gradeFolder.name)}">
                    ${escapeHtml(normalizeCatalogGradeLevel(gradeFolder.name) || gradeFolder.name)}
                  </button>`).join("")
                : `<small>Aucun niveau associé.</small>`}
            </div>
            <small>Clique sur un niveau pour modifier son dossier.</small>
          </div>`
        : "";
      const childLabel = childType === "grade_level" ? "Ajouter un niveau" : TYPE_META[childType]?.label;

      editorHost.innerHTML = `
        <div class="catalog-tree-admin-editor-head">
          <div>
            <span class="catalog-tree-admin-type-badge">${escapeHtml(typeMeta.label)}</span>
            <h3>${isNew ? `Créer : ${escapeHtml(typeMeta.label)}` : escapeHtml(model.name)}</h3>
          </div>
          ${!isNew && canCreateChild ? `<button class="btn primary dashboard-btn-with-icon" type="button" data-action="create-child">${renderIcon("add")}<span>${escapeHtml(childLabel)}</span></button>` : ""}
        </div>

        ${nameField}

        ${gradesField}

        <label class="catalog-tree-admin-field">
          <span>Parent</span>
          <select class="student-select" data-field="parent_id" ${model.node_type === "discipline" ? "disabled" : ""}>
            ${model.node_type === "discipline"
              ? `<option value="">Racine de l’arborescence</option>`
              : parentCandidates.map((parent) => `<option value="${escapeAttr(parent.id)}" ${parent.id === model.parent_id ? "selected" : ""}>${escapeHtml(getFolderPathLabel(parent.id))}</option>`).join("")}
          </select>
        </label>

        <label class="catalog-tree-admin-toggle">
          <input type="checkbox" data-field="is_active" ${model.is_active !== false ? "checked" : ""}/>
          <span>Actif dans Exploration et Aventure</span>
        </label>

        ${model.node_type === "grade_level"
          ? `<p class="catalog-tree-admin-help">Les activités sont créées uniquement dans ce dossier de niveau. Elles héritent automatiquement de ${escapeHtml(normalizeCatalogGradeLevel(model.name) || "ce niveau")}.</p>`
          : ""}

        ${!isNew ? `
          <div class="catalog-tree-admin-usage">
            <span>${childCount} sous-nœud${childCount > 1 ? "s" : ""}</span>
            <span>${activityCount} activité${activityCount > 1 ? "s" : ""}</span>
          </div>` : ""}

        <div class="catalog-tree-admin-editor-actions">
          ${!isNew ? `<button class="btn danger dashboard-btn-with-icon" type="button" data-action="delete" ${deleteDisabled ? "disabled" : ""}>${renderIcon("delete")}<span>Supprimer</span></button>` : `<button class="btn dashboard-btn-with-icon" type="button" data-action="cancel-create">${renderIcon("close")}<span>Annuler</span></button>`}
          <button class="btn primary dashboard-btn-with-icon" type="button" data-action="save">${renderIcon(isNew ? "add" : "save")}<span>${isNew ? "Créer" : "Enregistrer"}</span></button>
        </div>
      `;

      editorHost.querySelector("[data-action='cancel-create']")?.addEventListener("click", () => {
        draft = null;
        selectedId = folders[0]?.id || "";
        render();
      });
      editorHost.querySelector("[data-action='create-child']")?.addEventListener("click", () => {
        draft = buildDraft(model);
        selectedId = "";
        render();
      });
      editorHost.querySelectorAll("[data-action='select-grade-folder']").forEach((button) => {
        button.addEventListener("click", () => {
          selectedId = String(button.dataset.folderId || "");
          draft = null;
          render();
        });
      });
      editorHost.querySelector("[data-action='save']")?.addEventListener("click", () => void saveForm(model, { isNew }));
      editorHost.querySelector("[data-action='delete']")?.addEventListener("click", () => void deleteFolder(model));
    }

    async function saveForm(model, { isNew }) {
      if (busy) return;
      const name = String(editorHost.querySelector("[data-field='name']")?.value || "").trim();
      const parentId = model.node_type === "discipline"
        ? null
        : String(editorHost.querySelector("[data-field='parent_id']")?.value || "").trim() || null;
      const isActive = editorHost.querySelector("[data-field='is_active']")?.checked !== false;
      if (!name) return setMessage("Le nom est obligatoire.", true);
      if (model.node_type === "grade_level" && !normalizeCatalogGradeLevel(name)) {
        return setMessage("Choisis un niveau CP, CE1, CE2, CM1 ou CM2.", true);
      }
      const duplicate = folders.some((folder) => (
        folder.id !== model.id
        && String(folder.parent_id || "") === String(parentId || "")
        && String(folder.name || "").localeCompare(name, "fr", { sensitivity: "base" }) === 0
      ));
      if (duplicate) return setMessage("Un nœud portant ce nom existe déjà dans ce parent.", true);

      busy = true;
      setMessage(isNew ? "Création…" : "Enregistrement…");
      try {
        if (isNew) {
          const id = buildUniqueId(parentId, name);
          const siblings = getChildren(parentId);
          const created = await createPedagogicalNodeAsAdmin?.({
            id,
            parent_id: parentId,
            name,
            node_type: model.node_type,
            display_order: nextDisplayOrder(siblings),
            is_active: isActive
          });
          selectedId = created?.id || id;
          draft = null;
        } else {
          await updatePedagogicalNodeAsAdmin?.(model.id, {
            name,
            parent_id: parentId,
            is_active: isActive
          });
          selectedId = model.id;
        }
        changed = true;
        await refreshFolders();
        setMessage("Arborescence enregistrée.");
        showToast?.("Arborescence Exploration enregistrée.");
      } catch (err) {
        setMessage(err?.message || "Enregistrement impossible.", true);
      } finally {
        busy = false;
      }
    }

    async function deleteFolder(folder) {
      if (busy) return;
      const gradeChildren = folder.node_type === "learning_objective"
        ? getChildren(folder.id).filter((item) => item.node_type === "grade_level")
        : [];
      const hasChildren = getChildren(folder.id).some((item) => item.node_type !== "grade_level");
      const hasActivities = activities.some((activity) => String(activity?.pedagogical_node_id || activity?.folder_id || "") === folder.id);
      const gradeFolderIds = new Set(gradeChildren.map((item) => String(item.id)));
      const hasGradeActivities = activities.some((activity) => gradeFolderIds.has(String(activity?.pedagogical_node_id || activity?.folder_id || "")));
      if (hasChildren || hasActivities || hasGradeActivities) return setMessage("Déplace d’abord les sous-nœuds et les activités.", true);
      const deletionLabel = gradeChildren.length
        ? `Supprimer « ${folder.name} » et ses ${gradeChildren.length} dossier${gradeChildren.length > 1 ? "s" : ""} de niveau vide${gradeChildren.length > 1 ? "s" : ""} ?`
        : `Supprimer « ${folder.name} » ?`;
      if (!confirm(deletionLabel)) return;
      busy = true;
      try {
        if (gradeChildren.length) await Promise.all(gradeChildren.map((gradeFolder) => deletePedagogicalNodeAsAdmin?.(gradeFolder.id)));
        await deletePedagogicalNodeAsAdmin?.(folder.id);
        changed = true;
        selectedId = folder.parent_id || "";
        await refreshFolders();
        showToast?.(`« ${folder.name} » supprimé.`);
      } catch (err) {
        setMessage(err?.message || "Suppression impossible.", true);
      } finally {
        busy = false;
      }
    }

    async function moveSibling(folderId, delta) {
      if (busy) return;
      const folder = getFolder(folderId);
      if (!folder) return;
      const siblings = getChildren(folder.parent_id);
      const index = siblings.findIndex((item) => item.id === folder.id);
      const targetIndex = index + delta;
      if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
      const target = siblings[targetIndex];
      busy = true;
      try {
        await Promise.all([
          updatePedagogicalNodeAsAdmin?.(folder.id, { display_order: target.display_order }),
          updatePedagogicalNodeAsAdmin?.(target.id, { display_order: folder.display_order })
        ]);
        changed = true;
        await refreshFolders();
      } catch (err) {
        setMessage(err?.message || "Réorganisation impossible.", true);
      } finally {
        busy = false;
      }
    }

    async function refreshFolders() {
      folders = sortPedagogicalNodes(await listPedagogicalNodesForAdmin?.() || folders);
      rebuildFolderIndexes();
      if (selectedId && !getFolder(selectedId)) selectedId = folders[0]?.id || "";
      render();
    }

    function buildDraft(parent) {
      const parentFolder = parent ? getFolder(parent.id) : null;
      const nodeType = parentFolder ? TYPE_META[parentFolder.node_type]?.childType : "discipline";
      const usedGrades = new Set(
        parentFolder
          ? getChildren(parentFolder.id).map((folder) => normalizeCatalogGradeLevel(folder.name)).filter(Boolean)
          : []
      );
      const defaultGrade = PEDAGOGICAL_GRADE_LEVELS.find((grade) => !usedGrades.has(grade)) || "";
      return {
        id: "",
        parent_id: parentFolder?.id || null,
        name: nodeType === "grade_level" ? defaultGrade : "",
        node_type: nodeType || "learning_objective",
        display_order: 0,
        is_active: true
      };
    }

    function getFolder(id) {
      return folderById.get(String(id || "")) || null;
    }

    function getChildren(parentId) {
      const safeParent = String(parentId || "") || null;
      return childrenByParentId.get(safeParent) || [];
    }

    function rebuildFolderIndexes() {
      folderById = new Map();
      childrenByParentId = new Map();
      folders.forEach((folder) => {
        const id = String(folder?.id || "").trim();
        if (!id) return;
        folderById.set(id, folder);
        const parentId = String(folder?.parent_id || "").trim() || null;
        const children = childrenByParentId.get(parentId) || [];
        children.push(folder);
        childrenByParentId.set(parentId, children);
      });
      childrenByParentId.forEach((children) => {
        children.sort((left, right) => (
          Number(left?.display_order || 0) - Number(right?.display_order || 0)
          || String(left?.name || "").localeCompare(String(right?.name || ""), "fr")
        ));
      });
    }

    function getParentCandidates(model) {
      const requiredParentType = {
        domain: "discipline",
        theme: "domain",
        learning_objective: "theme",
        grade_level: "learning_objective"
      }[model.node_type];
      return folders.filter((folder) => folder.node_type === requiredParentType);
    }

    function getFolderPathLabel(folderId) {
      const names = [];
      const seen = new Set();
      let cursor = getFolder(folderId);
      while (cursor && !seen.has(cursor.id)) {
        names.unshift(cursor.name);
        seen.add(cursor.id);
        cursor = cursor.parent_id ? getFolder(cursor.parent_id) : null;
      }
      return names.join(" > ");
    }

    function openTreeExportOverlay() {
      if (exportOverlay?.isConnected) return;
      exportOverlay = document.createElement("div");
      exportOverlay.className = "catalog-tree-export-overlay";
      exportOverlay.setAttribute("role", "dialog");
      exportOverlay.setAttribute("aria-modal", "true");
      exportOverlay.setAttribute("aria-labelledby", "catalogTreeExportTitle");
      exportOverlay.innerHTML = `
        <div class="catalog-tree-export-card">
          <div class="catalog-tree-export-head">
            <div>
              <div id="catalogTreeExportTitle" class="modal-title">Exporter l’arborescence</div>
              <p>Choisis un niveau pour ne conserver que les objectifs qui le contiennent.</p>
            </div>
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="cancel" aria-label="Fermer" title="Fermer">${renderIcon("close")}</button>
          </div>
          <div class="catalog-tree-export-options" role="group" aria-label="Filtrer par niveau">
            <button class="btn primary" type="button" data-grade="">Tous les niveaux</button>
            ${PEDAGOGICAL_GRADE_LEVELS.map((grade) => `<button class="btn" type="button" data-grade="${escapeAttr(grade)}">${escapeHtml(grade)}</button>`).join("")}
          </div>
          <div class="catalog-tree-export-actions">
            <button class="btn" type="button" data-action="cancel">Annuler</button>
          </div>
        </div>
      `;
      document.body.appendChild(exportOverlay);

      const onExportKeydown = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        closeExportOverlay();
      };
      closeExportOverlay = () => {
        document.removeEventListener("keydown", onExportKeydown, true);
        exportOverlay?.remove();
        exportOverlay = null;
        closeExportOverlay = () => {};
      };
      document.addEventListener("keydown", onExportKeydown, true);
      exportOverlay.querySelectorAll("[data-action='cancel']").forEach((button) => button.addEventListener("click", closeExportOverlay));
      exportOverlay.addEventListener("click", (event) => {
        if (event.target === exportOverlay) closeExportOverlay();
      });
      exportOverlay.querySelectorAll("[data-grade]").forEach((button) => {
        button.addEventListener("click", () => {
          const grade = normalizeCatalogGradeLevel(button.dataset.grade) || "";
          downloadTreeExport(grade);
          closeExportOverlay();
          setMessage("Arborescence exportée.");
        });
      });
      exportOverlay.querySelector("[data-grade]")?.focus();
    }

    function downloadTreeExport(grade = "") {
      const content = formatTreeExport(grade);
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `arborescence-pedagogique${grade ? `-${grade.toLowerCase()}` : ""}-${date}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function formatTreeExport(grade = "") {
      const selectedGrade = normalizeCatalogGradeLevel(grade) || "";
      const counts = folders.reduce((total, folder) => {
        if (folder.node_type === "grade_level" || (selectedGrade && !containsGrade(folder, selectedGrade))) return total;
        if (Object.hasOwn(total, folder.node_type)) total[folder.node_type] += 1;
        return total;
      }, { discipline: 0, domain: 0, theme: 0, learning_objective: 0 });
      const lines = [
        `Arborescence pédagogique${selectedGrade ? ` — ${selectedGrade}` : ""}`,
        `Total : ${counts.discipline} disciplines, ${counts.domain} domaines, ${counts.theme} thèmes et ${counts.learning_objective} objectifs d’apprentissage`,
        ""
      ];
      const visit = (parentId, depth) => {
        getChildren(parentId).forEach((folder) => {
          if (folder.node_type === "grade_level") return;
          if (selectedGrade && !containsGrade(folder, selectedGrade)) return;
          const grades = folder.node_type === "learning_objective"
            ? getChildren(folder.id)
              .filter((child) => child.node_type === "grade_level")
              .map((child) => normalizeCatalogGradeLevel(child.name))
              .filter(Boolean)
            : [];
          const suffix = !selectedGrade && grades.length ? ` (${grades.join(", ")})` : "";
          lines.push(`${"  ".repeat(depth)}- ${folder.name}${suffix}`);
          visit(folder.id, depth + 1);
        });
      };
      visit(null, 0);
      return `${lines.join("\n")}\n`;
    }

    function containsGrade(folder, grade) {
      if (folder.node_type === "grade_level") return normalizeCatalogGradeLevel(folder.name) === grade;
      return getChildren(folder.id).some((child) => containsGrade(child, grade));
    }

    function buildUniqueId(parentId, name) {
      const baseSlug = slugify(name) || "nouveau";
      const base = parentId ? `${parentId}.${baseSlug}` : baseSlug;
      let id = base.slice(0, 160);
      let suffix = 2;
      const ids = new Set(folders.map((folder) => folder.id));
      while (ids.has(id)) {
        const tail = `-${suffix++}`;
        id = `${base.slice(0, 160 - tail.length)}${tail}`;
      }
      return id;
    }

    function slugify(value) {
      return String(value || "")
        .trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    function nextDisplayOrder(siblings) {
      return siblings.reduce((max, folder) => Math.max(max, Number(folder.display_order) || 0), -1) + 1;
    }

    function setMessage(message, isError = false) {
      if (!messageHost) return;
      messageHost.textContent = String(message || "");
      messageHost.classList.toggle("is-error", isError);
    }

    folders = folders.map(normalizePedagogicalNode);
    rebuildFolderIndexes();
    render();
  });
}
