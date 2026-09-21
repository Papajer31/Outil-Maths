import { normalizeSeyesState } from "./model.js";

export const SEYES_DOCUMENT_MIME = "application/vnd.site-outils.seyes+json";
export const SEYES_DOCUMENT_EXTENSION = ".seyes";

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function plainTextToSeyesHtml(text){
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  if (!lines.length) return "";
  return lines.map((line) => `<div>${line ? escapeHtml(line) : "<br>"}</div>`).join("");
}

export function seyesHtmlToPlainText(html){
  if (typeof document === "undefined") {
    return String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trimEnd();
  }
  const node = document.createElement("div");
  node.innerHTML = String(html || "");
  return String(node.innerText || node.textContent || "").replace(/\r\n?/g, "\n");
}

export function createSeyesDocumentPayload(rawState = {}){
  const state = normalizeSeyesState(rawState);
  return {
    type: "site-outils-seyes",
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    document: state
  };
}

export function serializeSeyesDocument(rawState = {}){
  return JSON.stringify(createSeyesDocumentPayload(rawState), null, 2);
}

export function parseSeyesDocumentText(text, { filename = "" } = {}){
  const safeFilename = String(filename || "").toLowerCase();
  if (safeFilename.endsWith(".txt")) {
    return normalizeSeyesState({ contentHtml: plainTextToSeyesHtml(text) });
  }
  let parsed;
  try { parsed = JSON.parse(String(text || "")); }
  catch { throw new Error("Ce fichier .seyes n’est pas valide."); }
  const source = parsed?.type === "site-outils-seyes"
    ? parsed.document
    : (parsed?.document && typeof parsed.document === "object" ? parsed.document : parsed);
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Ce fichier .seyes ne contient pas de document valide.");
  }
  return normalizeSeyesState(source);
}

export async function readSeyesDocumentFile(file){
  if (!(file instanceof Blob)) throw new Error("Fichier invalide.");
  const text = await file.text();
  return parseSeyesDocumentText(text, { filename: file.name || "" });
}

export function getSeyesFilename(rawState = {}, fallback = "document-seyes"){
  const state = normalizeSeyesState(rawState);
  const safe = String(state.title || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || fallback;
  return safe.toLowerCase().endsWith(SEYES_DOCUMENT_EXTENSION) ? safe : `${safe}${SEYES_DOCUMENT_EXTENSION}`;
}

export function createSeyesFile(rawState = {}, filename = ""){
  const name = filename || getSeyesFilename(rawState);
  return new File([serializeSeyesDocument(rawState)], name, { type: SEYES_DOCUMENT_MIME });
}

export function downloadSeyesDocument(rawState = {}, filename = ""){
  const file = createSeyesFile(rawState, filename);
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
