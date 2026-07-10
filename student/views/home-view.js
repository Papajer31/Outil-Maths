import { studentState } from "../student-state.js";
import { submitAccessCode } from "../student-actions.js";
import { escapeHtml, escapeAttr } from "../../shared/dom-helpers.js";

export function renderHomeView(root){
  const launchPhase = normalizeLaunchPhase(studentState.homeLaunchPhase);
  const isBusy = studentState.isCheckingAccessCode || studentState.isLoadingActivities || !!launchPhase;
  const homeMessage = isBusy ? "" : studentState.homeMessage;
  const shellPhaseClass = launchPhase ? ` student-home-shell-${launchPhase}` : "";

  root.innerHTML = `
    <div class="student-home-shell student-screen-shell student-stars-shell${shellPhaseClass}">
      <div class="student-stars-content student-home-content stack-lg text-center" role="region" aria-labelledby="student-home-title">
        <header class="stack-sm">
          <h1 id="student-home-title" class="title-xl">Tu dois d'abord écrire le code de ta classe.</h1>
        </header>

        <form id="studentHomeForm" class="home-form stack-md" novalidate>
          <label class="visually-hidden" for="classCode">Code de la classe</label>

          <input
            id="classCode"
            name="classCode"
            class="input-text"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="12"
            placeholder="ABC123"
            autofocus
            value="${escapeAttr(studentState.homeCode || studentState.accessCode)}"
            ${isBusy ? "disabled" : ""}
          >

          <button
            type="submit"
            class="btn btn-primary"
            ${isBusy ? "disabled" : ""}
          >
            Connexion
          </button>

          <div class="home-message" aria-live="polite">
            ${escapeHtml(homeMessage)}
          </div>
        </form>
      </div>
      ${launchPhase === "flying" ? `
        <div class="student-home-launch" aria-hidden="true">
          <img class="student-home-launch-rocket" src="./shared/ui-assets/rocket-on.svg" alt="">
        </div>
      ` : ""}
    </div>
  `;

  const form = document.getElementById("studentHomeForm");
  const input = document.getElementById("classCode");
  const rocket = document.querySelector(".student-home-launch-rocket");

  input?.addEventListener("input", () => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = String(input.value || "").toUpperCase();
    try {
      input.setSelectionRange(start, end);
    } catch {}
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAccessCode(input?.value || "");
  });

  rocket?.addEventListener("animationiteration", dispatchHomeLaunchFlightComplete);
  rocket?.addEventListener("animationend", dispatchHomeLaunchFlightComplete);

  if (!isBusy) {
    input?.focus();
    input?.select();
  }
}

function normalizeLaunchPhase(value){
  const phase = String(value || "").trim().toLowerCase();
  return ["fullscreen", "flying", "leaving"].includes(phase) ? phase : "";
}

function dispatchHomeLaunchFlightComplete(){
  window.dispatchEvent(new Event("student:home-launch-flight-complete"));
}
