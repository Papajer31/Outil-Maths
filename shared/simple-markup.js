const MARKUP_TOKEN_RE = /[§*_\[\]]/;

export function escapeSimpleMarkupHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readUntilMarker(source, startIndex, marker) {
  const endIndex = source.indexOf(marker, startIndex);
  if (endIndex <= startIndex) return null;
  const content = source.slice(startIndex, endIndex);
  if (!content.trim()) return null;
  return { content, endIndex };
}

export function renderSimpleMarkupToHtml(value) {
  const source = String(value ?? "");
  if (!source) return "";

  let html = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === "§") {
      html += "<br>";
      index += 1;
      continue;
    }

    if (char === "*") {
      const token = readUntilMarker(source, index + 1, "*");
      if (token) {
        html += `<strong class=\"simple-markup-strong\">${escapeSimpleMarkupHtml(token.content)}</strong>`;
        index = token.endIndex + 1;
        continue;
      }
    }

    if (char === "_") {
      const token = readUntilMarker(source, index + 1, "_");
      if (token) {
        html += `<em class=\"simple-markup-em\">${escapeSimpleMarkupHtml(token.content)}</em>`;
        index = token.endIndex + 1;
        continue;
      }
    }

    if (char === "[") {
      const token = readUntilMarker(source, index + 1, "]");
      if (token) {
        html += `<span class=\"simple-markup-highlight\">${escapeSimpleMarkupHtml(token.content)}</span>`;
        index = token.endIndex + 1;
        continue;
      }
    }

    const nextTokenIndex = source.slice(index + 1).search(MARKUP_TOKEN_RE);
    const endIndex = nextTokenIndex === -1 ? source.length : index + 1 + nextTokenIndex;
    html += escapeSimpleMarkupHtml(source.slice(index, endIndex));
    index = endIndex;
  }

  return html;
}

export function renderSimpleMarkupInto(target, value) {
  if (!target) return;
  target.innerHTML = renderSimpleMarkupToHtml(value);
}

export function stripSimpleMarkup(value) {
  return String(value ?? "")
    .replaceAll("§", "\n")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]/g, "$1");
}
