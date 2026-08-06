export function renderSoundBubble(text, { className = "", ariaLabel = "" } = {}) {
  const safeText = String(text || "").trim();
  if (!safeText) return "";

  const classes = ["rg-sound-bubble", String(className || "").trim()]
    .filter(Boolean)
    .join(" ");
  const fontSize = safeText.length >= 3 ? 22 : safeText.length === 2 ? 25 : 29;
  const label = ariaLabel || `son ${safeText}`;

  return `
    <span class="${escapeHtml(classes)}" role="img" aria-label="${escapeHtml(label)}">
      <svg viewBox="0 0 82 58" aria-hidden="true" focusable="false">
        <path class="rg-sound-bubble__shape" d="M14 4h54c6 0 10 4 10 10v25c0 6-4 10-10 10H32l-12 7 3-7h-9C8 49 4 45 4 39V14C4 8 8 4 14 4Z"/>
        <text class="rg-sound-bubble__text" x="41" y="31" font-size="${fontSize}">${escapeHtml(safeText)}</text>
      </svg>
    </span>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
