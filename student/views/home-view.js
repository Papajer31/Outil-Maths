import { studentState } from "../student-state.js";
import { submitAccessCode } from "../student-actions.js";

export function renderHomeView(root){
  root.innerHTML = `
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
          >

          <button
            type="submit"
            class="btn btn-primary"
            ${studentState.isCheckingAccessCode ? "disabled" : ""}
          >
            ${studentState.isCheckingAccessCode ? "Vérification…" : "Connexion"}
          </button>

          <div class="home-message" aria-live="polite">
            ${escapeHtml(studentState.homeMessage)}
          </div>
        </form>
      </div>
    </section>
  `;

  const form = document.getElementById("studentHomeForm");
  const input = document.getElementById("classCode");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAccessCode(input?.value || "");
  });

  input?.focus();
  input?.select();
}

function escapeHtml(value){
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value){
  return escapeHtml(value);
}