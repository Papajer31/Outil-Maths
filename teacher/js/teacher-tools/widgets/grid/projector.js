import {
  getGridBackground,
  getGridLineColor,
  normalizeGridState
} from "./model.js";

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderGridLines(state){
  const rows = Math.max(1, state.rows);
  const columns = Math.max(1, state.columns);
  const lines = [];

  for (let index = 1; index < columns; index += 1) {
    const x = (index / columns) * 100;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="100" vector-effect="non-scaling-stroke"></line>`);
  }
  for (let index = 1; index < rows; index += 1) {
    const y = (index / rows) * 100;
    lines.push(`<line x1="0" y1="${y}" x2="100" y2="${y}" vector-effect="non-scaling-stroke"></line>`);
  }
  return lines.join("");
}

export function renderGridProjector({ host, widgetInfoHost, state } = {}){
  if (!host) return;
  const safeState = normalizeGridState(state);
  const lineColor = getGridLineColor(safeState.lineColor);
  const background = getGridBackground(safeState);

  if (widgetInfoHost) {
    widgetInfoHost.textContent = `${safeState.rows} × ${safeState.columns}`;
  }

  host.innerHTML = `
    <div class="ttp-grid-surface" style="--ttp-grid-line-color:${escapeHtml(lineColor)}; --ttp-grid-line-width:${safeState.lineWidth}px; --ttp-grid-background:${escapeHtml(background)};" aria-label="Grille ${safeState.rows} lignes sur ${safeState.columns} colonnes">
      <svg class="ttp-grid-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g class="ttp-grid-lines">
          ${renderGridLines(safeState)}
        </g>
      </svg>
    </div>
  `;
}
