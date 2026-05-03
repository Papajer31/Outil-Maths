export function createHeaderPopupController({
  helpMenuPopup,
  btnDashboardHelp,
  userMenuPopup,
  btnUserMenu,
  onBeforeOpenHelp,
  onBeforeOpenUser
} = {}){
  function isHelpOpen(){
    return !!helpMenuPopup && !helpMenuPopup.classList.contains("hidden");
  }

  function isUserOpen(){
    return !!userMenuPopup && !userMenuPopup.classList.contains("hidden");
  }

  function closeHelp(){
    helpMenuPopup?.classList.add("hidden");
    btnDashboardHelp?.setAttribute("aria-expanded", "false");
  }

  function openHelp(){
    helpMenuPopup?.classList.remove("hidden");
    btnDashboardHelp?.setAttribute("aria-expanded", "true");
  }

  function toggleHelp(){
    if (isHelpOpen()) {
      closeHelp();
      return;
    }

    onBeforeOpenHelp?.();
    closeUser();
    openHelp();
  }

  function closeUser(){
    userMenuPopup?.classList.add("hidden");
    btnUserMenu?.setAttribute("aria-expanded", "false");
  }

  function openUser(){
    userMenuPopup?.classList.remove("hidden");
    btnUserMenu?.setAttribute("aria-expanded", "true");
  }

  function toggleUser(){
    if (isUserOpen()) {
      closeUser();
      return;
    }

    onBeforeOpenUser?.();
    closeHelp();
    openUser();
  }

  function closeAll(){
    closeHelp();
    closeUser();
  }

  function handleDocumentPointerDown(event){
    if (helpMenuPopup && isHelpOpen() && !helpMenuPopup.contains(event.target) && !btnDashboardHelp?.contains(event.target)) {
      closeHelp();
    }
    if (userMenuPopup && isUserOpen() && !userMenuPopup.contains(event.target) && !btnUserMenu?.contains(event.target)) {
      closeUser();
    }
  }

  return {
    closeAll,
    closeHelp,
    closeUser,
    handleDocumentPointerDown,
    isHelpOpen,
    isUserOpen,
    toggleHelp,
    toggleUser
  };
}
