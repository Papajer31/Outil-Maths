import { studentState } from "../student-state.js";
import { submitAccessCode } from "../student-actions.js";
import { escapeHtml, escapeAttr } from "../../shared/dom-helpers.js";

export function renderHomeView(root){
  const isBusy = studentState.isCheckingAccessCode || studentState.isLoadingActivities;
  const submitLabel = studentState.isLoadingActivities
    ? "Chargement…"
    : (studentState.isCheckingAccessCode ? "Vérification…" : "Connexion");

  root.innerHTML = `
    <div class="student-home-shell student-screen-shell student-stars-shell">
      <div class="student-stars-content student-home-content">
        <section class="center-card" aria-labelledby="student-home-title">
          <div class="stack-lg text-center">
            <header class="stack-sm">
              <h1 id="student-home-title" class="title-xl">Entre le code de ta classe</h1>
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
                value="${escapeAttr(studentState.homeCode || studentState.accessCode)}"
                ${isBusy ? "disabled" : ""}
              >

              <button
                type="submit"
                class="btn btn-primary"
                ${isBusy ? "disabled" : ""}
              >
                ${submitLabel}
              </button>

              <div class="home-message" aria-live="polite">
                ${escapeHtml(studentState.homeMessage)}
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  `;

  const form = document.getElementById("studentHomeForm");
  const input = document.getElementById("classCode");

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

  input?.focus();
  input?.select();
}
