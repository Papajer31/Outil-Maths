import {
  normalizeAccessCode
} from "../../shared/api-common.js";
import {
  accessCodeExists,
  createMyTeacherSpace,
  getCurrentUser,
  signInUser,
  signUpUser
} from "./teacher-api.js";

/* =========================
   DOM
   ========================= */

const teacherEmailInput = document.getElementById("teacherEmailInput");
const teacherPasswordInput = document.getElementById("teacherPasswordInput");
const btnTeacherLogin = document.getElementById("btnTeacherLogin");
const teacherLoginMessage = document.getElementById("teacherLoginMessage");

const btnOpenTeacherSignup = document.getElementById("btnOpenTeacherSignup");
const teacherSignupModal = document.getElementById("teacherSignupModal");
const btnCloseTeacherSignup = document.getElementById("btnCloseTeacherSignup");
const btnCancelTeacherSignup = document.getElementById("btnCancelTeacherSignup");
const btnSubmitTeacherSignup = document.getElementById("btnSubmitTeacherSignup");
const teacherSignupNameInput = document.getElementById("teacherSignupNameInput");
const teacherSignupEmailInput = document.getElementById("teacherSignupEmailInput");
const teacherSignupPasswordInput = document.getElementById("teacherSignupPasswordInput");
const teacherSignupPasswordConfirmInput = document.getElementById("teacherSignupPasswordConfirmInput");
const teacherSignupAccessCodeInput = document.getElementById("teacherSignupAccessCodeInput");
const teacherSignupMessage = document.getElementById("teacherSignupMessage");

/* =========================
   INIT
   ========================= */

boot();

function boot(){
  restoreTeacherEmail();
  checkExistingSession();
}

/* =========================
   EVENTS
   ========================= */

btnTeacherLogin?.addEventListener("click", submitTeacherLogin);
btnOpenTeacherSignup?.addEventListener("click", openTeacherSignupModal);
btnCloseTeacherSignup?.addEventListener("click", closeTeacherSignupModal);
btnCancelTeacherSignup?.addEventListener("click", closeTeacherSignupModal);
btnSubmitTeacherSignup?.addEventListener("click", submitTeacherSignup);
teacherSignupModal?.addEventListener("click", (event) => {
  if (event.target?.dataset?.closeSignup === "true") {
    closeTeacherSignupModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!teacherSignupModal || teacherSignupModal.classList.contains("hidden")) return;
  event.preventDefault();
  closeTeacherSignupModal();
});

teacherEmailInput?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  teacherPasswordInput?.focus();
});

teacherPasswordInput?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  submitTeacherLogin();
});

for (const input of [
  teacherSignupNameInput,
  teacherSignupEmailInput,
  teacherSignupPasswordInput,
  teacherSignupPasswordConfirmInput,
  teacherSignupAccessCodeInput
]) {
  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitTeacherSignup();
  });
}

teacherSignupAccessCodeInput?.addEventListener("input", () => {
  const start = teacherSignupAccessCodeInput.selectionStart ?? teacherSignupAccessCodeInput.value.length;
  const end = teacherSignupAccessCodeInput.selectionEnd ?? teacherSignupAccessCodeInput.value.length;
  teacherSignupAccessCodeInput.value = normalizeAccessCode(teacherSignupAccessCodeInput.value);
  try {
    teacherSignupAccessCodeInput.setSelectionRange(start, end);
  } catch {}
});

/* =========================
   LOGIQUE ENSEIGNANT
   ========================= */

async function checkExistingSession(){
  try {
    const user = await getCurrentUser();
    if (user){
      window.location.href = "dashboard.html";
    }
  } catch {
    // silence volontaire
  }
}

async function submitTeacherLogin(){
  const email = String(teacherEmailInput?.value || "").trim();
  const password = String(teacherPasswordInput?.value || "");

  if (!email){
    setTeacherMessage("Entre ton email.", true);
    teacherEmailInput?.focus();
    return;
  }

  if (!password){
    setTeacherMessage("Entre ton mot de passe.", true);
    teacherPasswordInput?.focus();
    return;
  }

  setTeacherMessage("Connexion en cours…");
  btnTeacherLogin.disabled = true;

  try {
    await signInUser(email, password);

    try {
      localStorage.setItem("lastTeacherEmail", email);
    } catch {}

    setTeacherMessage("Connexion réussie.");
    window.location.href = "dashboard.html";
  } catch (err) {
    setTeacherMessage(mapAuthError(err), true);
    btnTeacherLogin.disabled = false;
  }
}

function openTeacherSignupModal(){
  if (!teacherSignupModal) return;

  setSignupMessage("");

  if (teacherSignupEmailInput && teacherEmailInput?.value) {
    teacherSignupEmailInput.value = String(teacherEmailInput.value || "").trim();
  }

  teacherSignupModal.classList.remove("hidden");
  requestAnimationFrame(() => {
    teacherSignupNameInput?.focus();
  });
}

function closeTeacherSignupModal(){
  if (!teacherSignupModal) return;
  if (btnSubmitTeacherSignup?.disabled) return;
  teacherSignupModal.classList.add("hidden");
  setSignupMessage("");
}

async function submitTeacherSignup(){
  const displayName = String(teacherSignupNameInput?.value || "").trim();
  const email = String(teacherSignupEmailInput?.value || "").trim();
  const password = String(teacherSignupPasswordInput?.value || "");
  const confirmPassword = String(teacherSignupPasswordConfirmInput?.value || "");
  const accessCode = normalizeAccessCode(teacherSignupAccessCodeInput?.value || "");

  if (!displayName){
    setSignupMessage("Entre un nom affiché.", true);
    teacherSignupNameInput?.focus();
    return;
  }

  if (!email){
    setSignupMessage("Entre ton email.", true);
    teacherSignupEmailInput?.focus();
    return;
  }

  if (password.length < 6){
    setSignupMessage("Le mot de passe doit contenir au moins 6 caractères.", true);
    teacherSignupPasswordInput?.focus();
    return;
  }

  if (password !== confirmPassword){
    setSignupMessage("Les deux mots de passe ne correspondent pas.", true);
    teacherSignupPasswordConfirmInput?.focus();
    return;
  }

  if (accessCode.length < 3){
    setSignupMessage("Le code classe doit contenir au moins 3 lettres.", true);
    teacherSignupAccessCodeInput?.focus();
    return;
  }

  setSignupMessage("Création du compte…");
  btnSubmitTeacherSignup.disabled = true;

  try {
    const exists = await accessCodeExists(accessCode);
    if (exists) {
      throw new Error("Ce code classe est déjà utilisé.");
    }

    const signup = await signUpUser(email, password, {
      display_name: displayName
    });

    if (!signup?.session) {
      throw new Error("Compte créé, mais Supabase demande peut-être une confirmation email.");
    }

    await createMyTeacherSpace(accessCode);

    try {
      localStorage.setItem("lastTeacherEmail", email);
    } catch {}

    setSignupMessage("Compte créé. Ouverture du tableau de bord…");
    window.location.href = "dashboard.html";
  } catch (err) {
    setSignupMessage(mapAuthError(err), true);
    btnSubmitTeacherSignup.disabled = false;
  }
}

function restoreTeacherEmail(){
  try {
    const last = localStorage.getItem("lastTeacherEmail");
    if (last && teacherEmailInput){
      teacherEmailInput.value = last;
    }
  } catch {}
}

function mapAuthError(err){
  const msg = (err?.message || "").toLowerCase();

  if (msg.includes("invalid login credentials")){
    return "Email ou mot de passe incorrect.";
  }

  if (msg.includes("email not confirmed")){
    return "Email non confirmé.";
  }

  if (msg.includes("user not found")){
    return "Compte introuvable.";
  }

  if (msg.includes("too many requests")){
    return "Trop de tentatives. Réessaie plus tard.";
  }

  if (msg.includes("user already registered") || msg.includes("already registered") || msg.includes("already exists")){
    return "Un compte existe déjà avec cet email.";
  }

  if (msg.includes("password") && msg.includes("6")){
    return "Le mot de passe doit contenir au moins 6 caractères.";
  }

  if (msg.includes("code classe") || msg.includes("already used") || msg.includes("duplicate key") || msg.includes("teacher_spaces_access_code_unique")){
    return "Ce code classe est déjà utilisé.";
  }

  if (msg.includes("compte créé")){
    return "Compte créé, mais Supabase demande peut-être une confirmation email.";
  }

  return "Opération impossible.";
}

/* =========================
   UI
   ========================= */

function setTeacherMessage(text, isError = false){
  if (!teacherLoginMessage) return;
  teacherLoginMessage.textContent = text;
  teacherLoginMessage.style.color = isError ? "var(--bad)" : "var(--muted)";
}

function setSignupMessage(text, isError = false){
  if (!teacherSignupMessage) return;
  teacherSignupMessage.textContent = text;
  teacherSignupMessage.style.color = isError ? "var(--bad)" : "var(--muted)";
}
