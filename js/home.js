import {
  normalizeAccessCode,
  getCurrentUser,
  signInUser
} from "./users_info.js";

/* =========================
   DOM
   ========================= */

const classCodeInput = document.getElementById("classCodeInput");
const btnGo = document.getElementById("btnGo");

const teacherEmailInput = document.getElementById("teacherEmailInput");
const teacherPasswordInput = document.getElementById("teacherPasswordInput");
const btnTeacherLogin = document.getElementById("btnTeacherLogin");
const teacherLoginMessage = document.getElementById("teacherLoginMessage");

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

btnGo?.addEventListener("click", goToActivities);

btnTeacherLogin?.addEventListener("click", submitTeacherLogin);

classCodeInput?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  goToActivities();
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

/* =========================
   LOGIQUE ÉLÈVE
   ========================= */

async function goToActivities(){
  const raw = classCodeInput?.value ?? "";
  const code = normalizeAccessCode(raw);

  if (!code){
    alert("Entre un code de connexion valide.");
    return;
  }

  try {
    localStorage.setItem("lastAccessCode", code);
  } catch {}

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // on continue quand même si le navigateur refuse
  }

  window.location.href = `activities.html?classCode=${encodeURIComponent(code)}`;
}

/* =========================
   LOGIQUE ENSEIGNANT
   ========================= */

async function checkExistingSession(){
  try {
    const user = await getCurrentUser();
    if (user){
      window.location.href = "teacher-dashboard.html";
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
    window.location.href = "teacher-dashboard.html";
  } catch (err) {
    setTeacherMessage(mapAuthError(err), true);
    btnTeacherLogin.disabled = false;
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

  return "Connexion impossible.";
}

/* =========================
   UI
   ========================= */

function setTeacherMessage(text, isError = false){
  if (!teacherLoginMessage) return;
  teacherLoginMessage.textContent = text;
  teacherLoginMessage.style.color = isError ? "var(--bad)" : "var(--muted)";
}

