export function createDashboardShareManager({
  normalizeAccessCode,
  normalizeActivityMode,
  DEFAULT_ACTIVITY_MODE,
  isActivityShareable,
  copyActivityShareLink,
  openActivityShareLink,
  downloadActivityShareQrCode,
  ACTIVITY_SHARE_MESSAGES,
  getCurrentTeacherSpace,
  getCachedActivities,
  onBeforeOpen
} = {}){
  let dashboardSharePopup = null;
  let dashboardSharePopupAnchorButton = null;
  let dashboardShareContext = null;
  let dashboardShareToast = null;
  let dashboardShareToastTimer = null;

  function ensureDashboardSharePopup(){
    if (dashboardSharePopup) return dashboardSharePopup;

    const popup = document.createElement("div");
    popup.className = "panel cfg-share-popup dashboard-share-popup hidden";
    popup.setAttribute("role", "menu");
    popup.setAttribute("aria-label", "Partager l’activité");
    document.body.appendChild(popup);
    dashboardSharePopup = popup;
    return popup;
  }

  function ensureDashboardShareToast(){
    if (dashboardShareToast) return dashboardShareToast;

    const toast = document.createElement("div");
    toast.className = "dashboard-share-toast hidden";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
    dashboardShareToast = toast;
    return toast;
  }

  function showToast(message, { isError = false, duration = 2400 } = {}){
    const toast = ensureDashboardShareToast();
    toast.textContent = String(message || "");
    toast.classList.toggle("is-error", isError === true);
    toast.classList.remove("hidden");

    if (dashboardShareToastTimer) {
      clearTimeout(dashboardShareToastTimer);
      dashboardShareToastTimer = null;
    }

    if (duration > 0) {
      dashboardShareToastTimer = window.setTimeout(() => {
        dashboardShareToast?.classList.add("hidden");
        dashboardShareToastTimer = null;
      }, duration);
    }
  }

  function renderDashboardSharePopupContent(){
    const popup = ensureDashboardSharePopup();
    const activityMode = normalizeActivityMode(dashboardShareContext?.activityMode, DEFAULT_ACTIVITY_MODE);

    popup.innerHTML = `
      <button class="btn cfg-share-action" type="button" data-share-action="copy-link" role="menuitem">
        <span class="cfg-material-icon" aria-hidden="true">link_2</span>
        <span>Copier le lien</span>
      </button>

      <button class="btn cfg-share-action" type="button" data-share-action="open-link" role="menuitem">
        <span class="cfg-material-icon" aria-hidden="true">open_in_new</span>
        <span>Ouvrir le lien</span>
      </button>

      <button class="btn cfg-share-action" type="button" data-share-action="download-qr" role="menuitem">
        <span class="cfg-material-icon" aria-hidden="true">qr_code_2</span>
        <span>Télécharger le QR code</span>
      </button>
    `;

    popup.querySelectorAll("[data-share-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        void handleDashboardShareAction(btn.dataset.shareAction || "");
      });
    });
  }

  function isOpen(){
    return !!dashboardSharePopup && !dashboardSharePopup.classList.contains("hidden");
  }

  function close(){
    dashboardSharePopup?.classList.add("hidden");
    dashboardSharePopup?.style.removeProperty("left");
    dashboardSharePopup?.style.removeProperty("top");
    dashboardSharePopup?.style.removeProperty("visibility");

    if (dashboardSharePopupAnchorButton) {
      dashboardSharePopupAnchorButton.setAttribute("aria-expanded", "false");
    }

    dashboardSharePopupAnchorButton = null;
    dashboardShareContext = null;
  }

  function positionDashboardSharePopup(anchorButton){
    const popup = ensureDashboardSharePopup();
    if (!anchorButton?.getBoundingClientRect) return;

    popup.classList.remove("hidden");
    popup.style.visibility = "hidden";
    popup.style.left = "0px";
    popup.style.top = "0px";

    const rect = anchorButton.getBoundingClientRect();
    const popupWidth = popup.offsetWidth || 260;
    const popupHeight = popup.offsetHeight || 168;
    const margin = 12;

    let left = Math.round(rect.right - popupWidth);
    left = Math.max(margin, Math.min(left, window.innerWidth - popupWidth - margin));

    let top = Math.round(rect.bottom + 10);
    if (top + popupHeight > window.innerHeight - margin) {
      top = Math.round(rect.top - popupHeight - 10);
    }
    top = Math.max(margin, top);

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.visibility = "";
  }

  function toggle(button){
    const accessCode = normalizeAccessCode(getCurrentTeacherSpace?.()?.access_code);
    const configName = String(button?.dataset?.configName || "").trim();
    const activity = (getCachedActivities?.() || []).find(
      (item) => String(item?.config_name || "").trim() === configName
    );

    if (!isActivityShareable({ accessCode, configName })) {
      return;
    }

    if (isOpen() && dashboardSharePopupAnchorButton === button) {
      close();
      return;
    }

    onBeforeOpen?.();

    dashboardShareContext = {
      accessCode,
      configName,
      activityMode: normalizeActivityMode(activity?.activity_mode, DEFAULT_ACTIVITY_MODE)
    };
    dashboardSharePopupAnchorButton = button;
    renderDashboardSharePopupContent();
    button?.setAttribute("aria-expanded", "true");
    positionDashboardSharePopup(button);
  }

  async function handleDashboardShareAction(action){
    const context = dashboardShareContext;
    if (!context) return;

    close();

    if (action === "copy-link") {
      try {
        await copyActivityShareLink(context);
        showToast(ACTIVITY_SHARE_MESSAGES.copied);
      } catch {
        showToast(ACTIVITY_SHARE_MESSAGES.copyError, { isError: true });
      }
      return;
    }

    if (action === "open-link") {
      try {
        openActivityShareLink(context);
      } catch {}
      return;
    }

    if (action === "download-qr") {
      try {
        showToast(ACTIVITY_SHARE_MESSAGES.qrLoading, { duration: 0 });
        await downloadActivityShareQrCode(context);
        showToast(ACTIVITY_SHARE_MESSAGES.qrDownloaded);
      } catch {
        showToast(ACTIVITY_SHARE_MESSAGES.qrError, { isError: true });
      }
    }
  }

  function handleDocumentPointerDown(event){
    if (
      isOpen()
      && !dashboardSharePopup?.contains(event.target)
      && !dashboardSharePopupAnchorButton?.contains(event.target)
    ) {
      close();
    }
  }

  function handleDocumentKeyDown(event){
    if (event.key === "Escape" && isOpen()) {
      close();
    }
  }

  function handleResize(){
    close();
  }

  return {
    close,
    handleDocumentKeyDown,
    handleDocumentPointerDown,
    handleResize,
    isOpen,
    showToast,
    toggle
  };
}
