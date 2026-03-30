import { studentState } from "./student-state.js";
import { startStudentRouter } from "./student-router.js";
import { hydrateActivitiesRoute, submitAccessCode } from "./student-actions.js";

boot();

function boot(){
  hydrateInitialState();
  bindStaticHomeForm();

  const appRoot = document.getElementById("studentApp");
  if (!appRoot) return;

  startStudentRouter(appRoot);

  if (String(window.location.hash || "").startsWith("#/activities")){
    hydrateActivitiesRoute();
  }
}

function hydrateInitialState(){
  try {
    const lastAccessCode = localStorage.getItem("lastAccessCode");
    if (lastAccessCode && !studentState.accessCode){
      const code = String(lastAccessCode).trim().toUpperCase();
      studentState.accessCode = code;
      studentState.homeCode = code;
    }
  } catch {}
}

function bindStaticHomeForm(){
  const form = document.getElementById("studentHomeForm");
  const input = document.getElementById("classCode");
  const message = document.getElementById("homeMessage");

  if (!form || !input) return;

  if (studentState.homeCode || studentState.accessCode){
    input.value = studentState.homeCode || studentState.accessCode;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAccessCode(input.value || "");
    syncStaticHome();
  });

  window.addEventListener("student:refresh", syncStaticHome);

  syncStaticHome();
}

function syncStaticHome(){
  const input = document.getElementById("classCode");
  const message = document.getElementById("homeMessage");
  const button = document.querySelector("#studentHomeForm button[type='submit']");

  if (input){
    input.value = studentState.homeCode || studentState.accessCode || "";
  }

  if (message){
    message.textContent = studentState.homeMessage || "";
  }

  if (button){
    button.disabled = !!studentState.isCheckingAccessCode;
    button.textContent = studentState.isCheckingAccessCode ? "Vérification…" : "Connexion";
  }
}