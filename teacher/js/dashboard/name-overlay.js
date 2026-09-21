import { escapeAttr, escapeHtml } from "./text-utils.js";

export function openDashboardNameDialog({
  title,
  initialValue = "",
  placeholder = "",
  confirmLabel = "Enregistrer",
  onConfirm
} = {}) {
  const safeTitle = title || "Nom";
  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true" aria-label="${escapeAttr(safeTitle)}">
      <div class="modal-title">${escapeHtml(safeTitle)}</div>
      <input class="modal-text-input" type="text" value="${escapeAttr(initialValue)}" placeholder="${escapeAttr(placeholder)}">
      <div class="modal-actions">
        <div class="modal-message"></div>
        <button class="btn" type="button" data-action="cancel">Annuler</button>
        <button class="btn primary" type="button" data-action="confirm">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("input");
  const message = overlay.querySelector(".modal-message");
  const close = () => overlay.remove();
  const submit = async () => {
    const value = String(input?.value || "").trim();
    if (!value) {
      message.textContent = "Entre un nom.";
      message.classList.add("is-error");
      input?.focus();
      return;
    }
    try {
      await onConfirm?.(value);
      close();
    } catch (error) {
      message.textContent = error?.message || "Enregistrement impossible.";
      message.classList.add("is-error");
    }
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest('[data-action="cancel"]')) close();
    if (event.target.closest('[data-action="confirm"]')) void submit();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  });
  input?.focus();
  input?.select();
}
