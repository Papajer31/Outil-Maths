import { normalizeAccessCode } from "../../shared/api-common.js";

export const ACTIVITY_SHARE_DISABLED_TITLE = "Enregistre d’abord l’activité pour la partager";

export const ACTIVITY_SHARE_MESSAGES = {
  copied: "Lien copié.",
  copyError: "Impossible de copier le lien.",
  qrLoading: "Téléchargement du QR code…",
  qrDownloaded: "QR code téléchargé.",
  qrError: "Impossible de télécharger le QR code."
};

export function isActivityShareable({ accessCode, configName } = {}){
  return !!normalizeAccessCode(accessCode) && !!String(configName || "").trim();
}

export function buildActivityShareUrl({ accessCode, configName, baseUrl = window.location.href } = {}){
  if (!isActivityShareable({ accessCode, configName })) return "";

  const pageUrl = new URL("../index.html", baseUrl || window.location.href);
  const params = new URLSearchParams();
  params.set("classCode", normalizeAccessCode(accessCode));
  params.set("configName", String(configName || "").trim());
  params.set("shared", "1");
  pageUrl.hash = `#/sessionstart?${params.toString()}`;
  return pageUrl.toString();
}

export async function copyActivityShareLink(options = {}){
  const url = buildActivityShareUrl(options);
  if (!url) {
    throw new Error("missing-share-url");
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return url;
  }

  const probe = document.createElement("textarea");
  probe.value = url;
  probe.setAttribute("readonly", "readonly");
  probe.style.position = "fixed";
  probe.style.left = "-9999px";
  document.body.appendChild(probe);
  probe.select();
  document.execCommand("copy");
  probe.remove();
  return url;
}

export function openActivityShareLink(options = {}){
  const url = buildActivityShareUrl(options);
  if (!url) {
    throw new Error("missing-share-url");
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return url;
}

export async function downloadActivityShareQrCode({ configName, ...options } = {}){
  const url = buildActivityShareUrl({ configName, ...options });
  if (!url) {
    throw new Error("missing-share-url");
  }

  const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrUrl.searchParams.set("size", "768x768");
  qrUrl.searchParams.set("format", "png");
  qrUrl.searchParams.set("margin", "16");
  qrUrl.searchParams.set("data", url);

  const response = await fetch(qrUrl.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`QR ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${slugifyFilename(configName || "activite") || "activite"}-qr.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);

  return url;
}

function slugifyFilename(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
