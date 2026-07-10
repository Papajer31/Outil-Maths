const EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[data-allow-text-selection='true']",
  ".allow-text-selection"
].join(",");

let installed = false;

export function installStudentInteractionGuards(){
  if (installed) return;
  installed = true;

  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  document.addEventListener("selectstart", (event) => {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
  });

  document.addEventListener("dragstart", (event) => {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
  });
}

function isEditableTarget(target){
  const element = target?.nodeType === Node.ELEMENT_NODE
    ? target
    : target?.parentElement;
  return Boolean(element?.closest?.(EDITABLE_SELECTOR));
}
