import { normalizeNumericConstraint } from "../../shared/value-constraints.js";

const GLOBAL_MIN = 1;
export const TOOL_THEME_ID = "blocs_bleus_base10";
export const TOOL_THEME_LABEL = "Carrés";
export const TOOL_MAX = 999;
const GLOBAL_MAX = TOOL_MAX;

const PICBILLE_UNIT_VIEWBOX = "0 0 16.604584 16.604584";
const PICBILLE_UNIT_BODY = `
  <g transform="translate(-47.392498,-45.275833)">
    <circle
      style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1"
      cx="55.69479"
      cy="53.578125"
      r="8.0697918" />
  </g>
`;

const PICBILLE_TEN_VIEWBOX = "0 0 193.16946 16.619589";
const PICBILLE_TEN_BODY = `
  <rect
    x="0.353856"
    y="0.304427"
    width="192.461749"
    height="16.010735"
    style="fill:#f5a80e;fill-opacity:1;stroke:#000000;stroke-width:0.707525;stroke-dasharray:none;stroke-opacity:1" />
  <rect
    x="96.230968"
    y="0.304427"
    width="0.707525"
    height="16.010735"
    style="fill:#000000;fill-opacity:1;stroke:none" />
`;


const DEDE_VIEWBOX = "0 0 136.00441 74.859123";
const DEDE_LAYER_TRANSFORM = "translate(-32.904081,-58.871202)";
const DEDE_INLINE_ASSETS = Object.freeze({
  ten: Object.freeze({
    viewBox: DEDE_VIEWBOX,
    body: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1" cx="-112.67268" cy="-150.50809" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-8" cx="-96.068108" cy="-133.9035" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1" cx="-79.463509" cy="-150.50809" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2" cx="-112.67268" cy="-117.29893" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23" cx="-79.463509" cy="-117.29893" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-6" cx="-112.67268" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-8-3" cx="-96.068108" cy="-68.679771" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1-7" cx="-79.463509" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2-8" cx="-112.67268" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><path style="fill:none;fill-opacity:1;stroke:#1063a2;stroke-width:2.03862;stroke-dasharray:none;stroke-opacity:1" d="m 161.57537,69.022091 c 0,0 2.39922,2.73409 3.20008,4.75955 2.34622,5.93396 3.03087,13.15705 3.10284,19.539494 0.0904,8.017415 -0.35643,17.867415 -3.52328,25.230435 -1.74085,4.04752 -5.23948,7.44509 -9.15271,9.45641 -7.08383,3.64094 -12.82646,4.28284 -20.25774,4.5966 -13.90175,0.58696 -27.87709,-1.42737 -41.440858,-2.06446 -10.11918,-0.47529 -18.69943,-0.32329 -28.74649,-1.62214 -6.02808,-0.7793 -13.78081,-1.90336 -19.2397,-4.58187 -3.11789,-1.52986 -6.32684,-4.06053 -7.90543,-7.15918 -2.21741,-4.35266 -2.60332,-7.32927 -3.23835,-11.74104 -0.82547,-5.73476 -0.42173,-12.126395 0.47621,-17.850209 1.05665,-6.73542 2.45331,-13.02496 5.90527,-18.90022 1.25302,-2.13264 3.90733,-4.39506 6.28624,-5.05915 7.56054,-2.11057 13.31736,-2.29151 20.57315,-2.86367 11.17437,-0.88116 21.74632,-0.90359 32.955138,-0.85909 10.19442,0.0404 21.19663,0.37041 31.33596,1.43183 9.18475,0.96149 26.57365,4.48641 26.57365,4.48641" id="path4" nodetypes="cssssssssssssssssc" />`
  }),
  units: Object.freeze({
    1: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" />`,
    2: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1-7" cx="-79.463509" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" />`,
    3: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1-7" cx="-79.463509" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2-8" cx="-112.67268" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" />`,
    4: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-6" cx="-112.67268" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1-7" cx="-79.463509" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2-8" cx="-112.67268" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" />`,
    5: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-6" cx="-112.67268" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-8-3" cx="-96.068108" cy="-68.679771" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1-7" cx="-79.463509" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2-8" cx="-112.67268" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" />`,
    6: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23" cx="-79.463509" cy="-117.29893" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-6" cx="-112.67268" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-8-3" cx="-96.068108" cy="-68.679771" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1-7" cx="-79.463509" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2-8" cx="-112.67268" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" />`,
    7: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1" cx="-79.463509" cy="-150.50809" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23" cx="-79.463509" cy="-117.29893" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-6" cx="-112.67268" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-8-3" cx="-96.068108" cy="-68.679771" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1-7" cx="-79.463509" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2-8" cx="-112.67268" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" />`,
    8: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1" cx="-79.463509" cy="-150.50809" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2" cx="-112.67268" cy="-117.29893" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23" cx="-79.463509" cy="-117.29893" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-6" cx="-112.67268" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-8-3" cx="-96.068108" cy="-68.679771" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1-7" cx="-79.463509" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2-8" cx="-112.67268" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" />`,
    9: `<circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1" cx="-112.67268" cy="-150.50809" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1" cx="-79.463509" cy="-150.50809" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2" cx="-112.67268" cy="-117.29893" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23" cx="-79.463509" cy="-117.29893" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-6" cx="-112.67268" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-8-3" cx="-96.068108" cy="-68.679771" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-1-7" cx="-79.463509" cy="-85.284348" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-2-8" cx="-112.67268" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" /><circle style="fill:#33b7e5;fill-opacity:1;stroke:#000000;stroke-width:0.465;stroke-dasharray:none;stroke-opacity:1" id="path1-23-8" cx="-79.463509" cy="-52.075176" r="8.0697918" transform="matrix(0,-1,-1,0,0,0)" />`
  })
});

const PICBILLE_SCALE = 1.5;
const PICBILLE_TEN_W = 193.16946 * PICBILLE_SCALE;
const PICBILLE_TEN_H = 16.619589 * PICBILLE_SCALE;
const PICBILLE_UNIT_SIZE = 16.604584 * PICBILLE_SCALE;
const PICBILLE_UNIT_GROUP_GAP_FACTOR = 2.35;
const PICBILLE_UNIT_GAP = (PICBILLE_TEN_W - PICBILLE_UNIT_SIZE * 10) / (8 + PICBILLE_UNIT_GROUP_GAP_FACTOR);
const PICBILLE_UNIT_GROUP_GAP = PICBILLE_UNIT_GAP * PICBILLE_UNIT_GROUP_GAP_FACTOR;
const PICBILLE_BAR_GAP = 5 * PICBILLE_SCALE;
const PICBILLE_BIG_GROUP_GAP = 16 * PICBILLE_SCALE;
const PICBILLE_SMALL_GROUP_GAP = 8 * PICBILLE_SCALE;
const PICBILLE_SIDE_PAD = 26 * PICBILLE_SCALE;
const PICBILLE_TOP_PAD = 18 * PICBILLE_SCALE;
const PICBILLE_BOTTOM_PAD = 22 * PICBILLE_SCALE;
const PICBILLE_UNIT_ROW_GAP = 16 * PICBILLE_SCALE;
const PICBILLE_UNIT_CROSS_SIZE = 3.6 * PICBILLE_SCALE;

const CUE_ASSET_URLS = Object.freeze({
  picbille: new URL("../../shared/tool-assets/personnages/picbille.webp", import.meta.url).href,
  dede: new URL("../../shared/tool-assets/personnages/dede.webp", import.meta.url).href,
  blocs_textuels: new URL("../../shared/tool-assets/representation/tuiles.webp", import.meta.url).href,
  blocs_bleus_base10: new URL("../../shared/tool-assets/representation/blue_squares.webp", import.meta.url).href
});

export const REPRESENTATION_DIRECTIONS = Object.freeze({
  NUMBER_TO_REPRESENTATION: "number_to_representation",
  REPRESENTATION_TO_NUMBER: "representation_to_number"
});

export const TEXT_BLOCKS_LABEL_MODES = Object.freeze({
  FULL_EXPLICIT: "full_explicit",
  FULL_ABRIDGED: "full_abridged",
  LARGE_CLASS_ONLY: "large_class_only",
  LARGE_CLASS_ABRIDGED: "large_class_abridged"
});

export const REPRESENTATION_THEMES = Object.freeze([
  Object.freeze({ id: TOOL_THEME_ID, label: TOOL_THEME_LABEL, max: TOOL_MAX })
]);

const THEME_BY_ID = Object.freeze(Object.fromEntries(REPRESENTATION_THEMES.map((theme) => [theme.id, theme])));
const DEFAULT_ACTIVE_THEMES = Object.freeze([TOOL_THEME_ID]);
const DEFAULT_NUMBER_TO_REPRESENTATION = true;
const DEFAULT_REPRESENTATION_TO_NUMBER = false;

export const DISPLAY_MODES = Object.freeze({
  ORDERED: "ordered",
  RANDOM: "random"
});

export function getDefaultSettings() {
  return {
    min: 1,
    max: TOOL_MAX,
    valueMode: "simple",
    valueStart: 1,
    valueStep: 1,
    valueList: [],
    activeThemes: [...DEFAULT_ACTIVE_THEMES],
    allowNumberToRepresentation: DEFAULT_NUMBER_TO_REPRESENTATION,
    allowRepresentationToNumber: DEFAULT_REPRESENTATION_TO_NUMBER,
    displayMode: DISPLAY_MODES.ORDERED,
    allowLooseTens: false,
    textBlocksLabelMode: TEXT_BLOCKS_LABEL_MODES.FULL_EXPLICIT
  };
}

export function normalizeSettings(settings = {}) {
  const base = {
    ...getDefaultSettings(),
    ...(isPlainObject(settings) ? settings : {})
  };

  const numbers = normalizeNumericConstraint({
    min: base.min,
    max: base.max,
    mode: base.valueMode,
    start: base.valueStart,
    step: base.valueStep,
    values: base.valueList
  }, {
    inputMin: GLOBAL_MIN,
    inputMax: TOOL_MAX,
    defaultMin: 1,
    defaultMax: TOOL_MAX,
    defaultStart: 1,
    defaultStep: 1,
    defaultValues: []
  });

  const activeThemes = normalizeActiveThemes(base.activeThemes, numbers.max);
  const allowNumberToRepresentation = base.allowNumberToRepresentation === true;
  const allowRepresentationToNumber = base.allowRepresentationToNumber === true;

  return {
    min: numbers.min,
    max: numbers.max,
    valueMode: numbers.mode,
    valueStart: numbers.start,
    valueStep: numbers.step,
    valueList: numbers.values,
    allowedValues: numbers.allowedValues,
    activeThemes,
    allowNumberToRepresentation: allowNumberToRepresentation || !allowRepresentationToNumber,
    allowRepresentationToNumber,
    displayMode: normalizeDisplayMode(base.displayMode),
    allowLooseTens: base.allowLooseTens === true,
    textBlocksLabelMode: normalizeTextBlocksLabelMode(base.textBlocksLabelMode)
  };
}

export function getThemeCatalog() {
  return REPRESENTATION_THEMES.map((theme) => ({ ...theme }));
}

export function getThemeAvailability(maxOrSettings = GLOBAL_MAX) {
  const max = typeof maxOrSettings === "number"
    ? clampInt(maxOrSettings, GLOBAL_MIN, GLOBAL_MAX)
    : normalizeSettings(maxOrSettings).max;

  return REPRESENTATION_THEMES.map((theme) => ({
    ...theme,
    compatible: max <= theme.max,
    disabled: max > theme.max
  }));
}

export function getAvailableDirections(settings = {}) {
  const cfg = normalizeSettings(settings);
  const directions = [];
  if (cfg.allowNumberToRepresentation) {
    directions.push(REPRESENTATION_DIRECTIONS.NUMBER_TO_REPRESENTATION);
  }
  if (cfg.allowRepresentationToNumber) {
    directions.push(REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER);
  }
  return directions;
}

export function getCompatibleThemeIdsForValue(value) {
  const safeValue = clampInt(value, GLOBAL_MIN, GLOBAL_MAX);
  return safeValue <= TOOL_MAX ? [TOOL_THEME_ID] : [];
}

export function getEligibleValues(settings = {}) {
  const cfg = normalizeSettings(settings);
  return (Array.isArray(cfg.allowedValues) ? cfg.allowedValues : []).filter((value) => getCompatibleThemeIdsForValue(value).length > 0);
}

export function pickQuestion(settings, { avoidKey = null } = {}) {
  const cfg = normalizeSettings(settings);
  const values = getEligibleValues(cfg);
  const directions = getAvailableDirections(cfg);

  if (!values.length) {
    throw new Error("Aucun nombre compatible avec les thèmes actifs.");
  }

  if (!directions.length) {
    throw new Error("Active au moins une direction pour Représentation décimale.");
  }

  const fallback = buildQuestionCandidate(cfg, values, directions);
  if (!fallback) {
    throw new Error("Aucune question possible avec cette configuration.");
  }

  if (!avoidKey) {
    return fallback;
  }

  const maxAttempts = Math.max(8, values.length * directions.length * Math.max(1, cfg.activeThemes.length));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = buildQuestionCandidate(cfg, values, directions);
    if (candidate && questionKey(candidate) !== avoidKey) {
      return candidate;
    }
  }

  return fallback;
}

export function questionKey(question) {
  return [
    String(question?.value ?? ""),
    String(question?.direction ?? ""),
    String(question?.themeId ?? "")
  ].join("|");
}

export function renderRepresentationSvg(themeId, value, options = {}) {
  const safeThemeId = String(themeId || "").trim();
  const safeValue = clampInt(value, GLOBAL_MIN, GLOBAL_MAX);

  switch (safeThemeId) {
    case "picbille":
      return renderPicbilleSvg(safeValue);
    case "dede":
      return renderDedeSvg(safeValue);
    case "blocs_textuels":
      return renderTextBlocksSvg(safeValue, options);
    case "blocs_bleus_base10":
      return renderBlueBase10Svg(safeValue, options);
    default:
      return renderFallbackSvg(safeValue, safeThemeId);
  }
}

export function renderRepresentationPieceSvg(themeId, kind, options = {}) {
  const safeThemeId = String(themeId || "").trim();
  const safeKind = String(kind || "").trim();

  switch (safeThemeId) {
    case "picbille":
      if (safeKind === "tens") return renderPicbillePieceSvg("tens");
      return renderPicbillePieceSvg("ones");
    case "dede":
      if (safeKind === "tens") return renderDedePieceSvg("tens");
      return renderDedePieceSvg("ones");
    case "blocs_textuels":
      return renderTextBlocksPieceSvg(safeKind, options);
    case "blocs_bleus_base10":
      return renderBlueBase10PieceSvg(safeKind);
    default:
      return renderFallbackSvg(0, `${safeThemeId}:${safeKind}`);
  }
}

export function getQuestionInstruction(question) {
  const direction = String(question?.direction || "").trim();
  if (direction === REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER) {
    return "Donne l’écriture chiffrée de ce nombre.";
  }
  if (direction === REPRESENTATION_DIRECTIONS.NUMBER_TO_REPRESENTATION) {
    return "Donne une représentation décimale de ce nombre.";
  }
  return "Donne la réponse.";
}

function buildQuestionCandidate(settings, values, directions) {
  const value = pickRandom(values);
  const direction = pickRandom(directions);
  const themeId = pickThemeForValue(settings, value);

  if (!themeId) {
    return null;
  }

  const decomposition = decomposeValue(value);
  const displayBuild = buildDisplayDecompositionForQuestion(settings, direction, themeId, decomposition);

  return {
    id: `${value}_${direction}_${themeId}_${displayBuild.looseTens || 0}`,
    value,
    n: value,
    direction,
    themeId,
    theme: themeId,
    themeLabel: THEME_BY_ID[themeId]?.label || themeId,
    cueAsset: direction === REPRESENTATION_DIRECTIONS.NUMBER_TO_REPRESENTATION
      ? (CUE_ASSET_URLS[themeId] || null)
      : null,
    decomposition,
    displayBuild,
    looseTens: displayBuild.looseTens || 0,
    answerType: direction === REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER
      ? "number"
      : "representation_build",
    expectedValue: value,
    expectedBuild: { ...decomposition },
    instruction: getQuestionInstruction({ direction })
  };
}

function buildDisplayDecompositionForQuestion(settings, direction, themeId, decomposition) {
  const base = {
    thousands: decomposition.thousands || 0,
    hundreds: decomposition.hundreds || 0,
    tens: decomposition.tens || 0,
    ones: decomposition.ones || 0,
    looseTens: 0
  };

  if (
    themeId !== "blocs_bleus_base10"
    || direction !== REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER
    || settings.allowLooseTens !== true
    || base.tens <= 0
  ) {
    return base;
  }

  const maxLooseTens = Math.min(2, base.tens);
  const looseTens = Math.floor(Math.random() * (maxLooseTens + 1));
  if (looseTens <= 0) return base;

  return {
    ...base,
    tens: Math.max(0, base.tens - looseTens),
    ones: base.ones + looseTens * 10,
    looseTens
  };
}

function pickThemeForValue(settings, value) {
  return getCompatibleThemeIdsForValue(value).includes(TOOL_THEME_ID) ? TOOL_THEME_ID : null;
}

function normalizeActiveThemes(rawThemes, max) {
  return [TOOL_THEME_ID];
}

function normalizeDisplayMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  return Object.values(DISPLAY_MODES).includes(safeValue) ? safeValue : DISPLAY_MODES.ORDERED;
}


function normalizeTextBlocksLabelMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (Object.values(TEXT_BLOCKS_LABEL_MODES).includes(safeValue)) {
    return safeValue;
  }
  return TEXT_BLOCKS_LABEL_MODES.FULL_EXPLICIT;
}

function decomposeValue(value) {
  const safeValue = clampInt(value, GLOBAL_MIN, GLOBAL_MAX);
  return {
    thousands: Math.floor(safeValue / 1000),
    hundreds: Math.floor((safeValue % 1000) / 100),
    tens: Math.floor((safeValue % 100) / 10),
    ones: safeValue % 10
  };
}


function renderPicbilleSvg(value) {
  const safeValue = clampInt(value, 1, 99);
  const { ones } = decomposeValue(safeValue);
  const tenGroups = getPicbilleTenGroupsForValue(safeValue);
  const tenStackHeight = computePicbilleStackHeight(tenGroups);
  const unitsRowHeight = ones > 0 ? PICBILLE_UNIT_SIZE : 0;
  const width = Math.ceil(PICBILLE_TEN_W + PICBILLE_SIDE_PAD * 2);
  const height = Math.ceil(PICBILLE_TOP_PAD + unitsRowHeight + (ones > 0 ? PICBILLE_UNIT_ROW_GAP : 0) + tenStackHeight + PICBILLE_BOTTOM_PAD);
  const tenX = PICBILLE_SIDE_PAD;
  const tenBottomY = height - PICBILLE_BOTTOM_PAD;
  const tenYs = buildPicbilleTenYs(tenGroups, tenBottomY);
  const unitsY = ones > 0 ? PICBILLE_TOP_PAD : 0;

  const tenBody = tenYs.map((y) => renderInlineAsset({
    x: tenX,
    y,
    width: PICBILLE_TEN_W,
    height: PICBILLE_TEN_H,
    viewBox: PICBILLE_TEN_VIEWBOX,
    body: PICBILLE_TEN_BODY
  })).join("");

  let unitsCursorX = tenX;
  const unitsBody = Array.from({ length: ones }, (_, index) => {
    const x = unitsCursorX;
    unitsCursorX += PICBILLE_UNIT_SIZE;
    if (index < ones - 1) {
      unitsCursorX += index === 4 ? PICBILLE_UNIT_GROUP_GAP : PICBILLE_UNIT_GAP;
    }
    const cx = x + PICBILLE_UNIT_SIZE / 2;
    const cy = unitsY + PICBILLE_UNIT_SIZE / 2;
    const cross = index === 2 || index === 7 ? renderPicbilleCross(cx, cy) : "";
    return `${renderInlineAsset({
      x,
      y: unitsY,
      width: PICBILLE_UNIT_SIZE,
      height: PICBILLE_UNIT_SIZE,
      viewBox: PICBILLE_UNIT_VIEWBOX,
      body: PICBILLE_UNIT_BODY
    })}${cross}`;
  }).join("");

  return svgRoot({
    width,
    height,
    ariaLabel: `Représentation Picbille de ${safeValue}`,
    body: `${unitsBody}${tenBody}`
  });
}


function getPicbilleTenGroupsForValue(value) {
  const safeValue = clampInt(value, 1, 99);
  const tens = Math.floor(safeValue / 10);

  if (tens <= 0) return [];
  if (safeValue <= 59) {
    return [{ count: tens, gapAfter: 0 }];
  }
  if (safeValue <= 69) {
    return [
      { count: 5, gapAfter: PICBILLE_BIG_GROUP_GAP },
      { count: 1, gapAfter: 0 }
    ];
  }
  if (safeValue <= 79) {
    return [
      { count: 5, gapAfter: PICBILLE_BIG_GROUP_GAP },
      { count: 1, gapAfter: PICBILLE_SMALL_GROUP_GAP },
      { count: 1, gapAfter: 0 }
    ];
  }
  if (safeValue === 80) {
    return [
      { count: 2, gapAfter: PICBILLE_BIG_GROUP_GAP },
      { count: 2, gapAfter: PICBILLE_BIG_GROUP_GAP },
      { count: 2, gapAfter: PICBILLE_BIG_GROUP_GAP },
      { count: 2, gapAfter: 0 }
    ];
  }
  if (safeValue <= 89) {
    return [
      { count: 5, gapAfter: PICBILLE_BIG_GROUP_GAP },
      { count: 3, gapAfter: 0 }
    ];
  }
  return [
    { count: 5, gapAfter: PICBILLE_BIG_GROUP_GAP },
    { count: 3, gapAfter: PICBILLE_BIG_GROUP_GAP },
    { count: 1, gapAfter: 0 }
  ];
}

function computePicbilleStackHeight(groups) {
  if (!groups.length) return 0;
  let total = 0;
  groups.forEach((group, index) => {
    total += group.count * PICBILLE_TEN_H + Math.max(0, group.count - 1) * PICBILLE_BAR_GAP;
    if (index < groups.length - 1) {
      total += Number(group.gapAfter) || 0;
    }
  });
  return total;
}

function buildPicbilleTenYs(groups, bottomY) {
  const ys = [];
  let cursor = bottomY - PICBILLE_TEN_H;
  groups.forEach((group, groupIndex) => {
    for (let item = 0; item < group.count; item += 1) {
      ys.push(cursor);
      cursor -= PICBILLE_TEN_H;
      if (item < group.count - 1) {
        cursor -= PICBILLE_BAR_GAP;
      }
    }
    if (groupIndex < groups.length - 1) {
      cursor -= Number(group.gapAfter) || 0;
    }
  });
  return ys;
}

function renderPicbilleCross(cx, cy) {
  const half = PICBILLE_UNIT_CROSS_SIZE;
  return `
    <path d="M ${round(cx - half)} ${round(cy - half)} L ${round(cx + half)} ${round(cy + half)}" stroke="#7b7b7b" stroke-width="${round(1.35 * PICBILLE_SCALE)}" stroke-linecap="round" />
    <path d="M ${round(cx + half)} ${round(cy - half)} L ${round(cx - half)} ${round(cy + half)}" stroke="#7b7b7b" stroke-width="${round(1.35 * PICBILLE_SCALE)}" stroke-linecap="round" />
  `;
}

function renderPicbillePieceSvg(kind) {
  if (kind === "tens") {
    return svgRootExact({
      width: Math.ceil(PICBILLE_TEN_W),
      height: Math.ceil(PICBILLE_TEN_H),
      ariaLabel: "Dizaine Picbille",
      body: renderInlineAsset({
        x: 0,
        y: 0,
        width: PICBILLE_TEN_W,
        height: PICBILLE_TEN_H,
        viewBox: PICBILLE_TEN_VIEWBOX,
        body: PICBILLE_TEN_BODY
      })
    });
  }

  return svgRootExact({
    width: Math.ceil(PICBILLE_UNIT_SIZE),
    height: Math.ceil(PICBILLE_UNIT_SIZE),
    ariaLabel: "Unité Picbille",
    body: renderInlineAsset({
      x: 0,
      y: 0,
      width: PICBILLE_UNIT_SIZE,
      height: PICBILLE_UNIT_SIZE,
      viewBox: PICBILLE_UNIT_VIEWBOX,
      body: PICBILLE_UNIT_BODY
    })
  });
}


function renderDedeSvg(value) {
  const safeValue = clampInt(value, 1, 99);
  const { tens, ones } = decomposeValue(safeValue);
  const bricks = [];

  for (let index = 0; index < tens; index += 1) {
    bricks.push({ kind: "ten" });
  }
  if (ones > 0) {
    bricks.push({ kind: "unit", value: ones });
  }

  const assetScale = 0.95;
  const assetWidth = 136.00441 * assetScale;
  const assetHeight = 74.859123 * assetScale;
  const columnGap = 18;
  const rowGap = 14;
  const rowCount = Math.max(1, Math.ceil(bricks.length / 2));
  const width = Math.ceil(assetWidth * 2 + columnGap + 48);
  const height = Math.ceil(rowCount * assetHeight + Math.max(0, rowCount - 1) * rowGap + 40);
  const startX = (width - (assetWidth * 2 + columnGap)) / 2;
  const startY = (height - (rowCount * assetHeight + Math.max(0, rowCount - 1) * rowGap)) / 2;

  const body = bricks.map((brick, index) => {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const x = startX + column * (assetWidth + columnGap);
    const y = startY + row * (assetHeight + rowGap);
    const asset = brick.kind === "ten"
      ? { viewBox: DEDE_VIEWBOX, body: wrapDedeBody(DEDE_INLINE_ASSETS.ten.body) }
      : { viewBox: DEDE_VIEWBOX, body: renderDedeUnitBody(brick.value) };

    return renderInlineAsset({
      x,
      y,
      width: assetWidth,
      height: assetHeight,
      viewBox: asset.viewBox,
      body: asset.body
    });
  }).join("");

  return svgRoot({
    width,
    height,
    ariaLabel: `Représentation Dédé de ${safeValue}`,
    body
  });
}

function renderDedeUnitBody(value) {
  const safeValue = clampInt(value, 1, 9);
  return wrapDedeBody(DEDE_INLINE_ASSETS.units[safeValue] || DEDE_INLINE_ASSETS.units[1]);
}

function wrapDedeBody(body) {
  return `<g transform="${DEDE_LAYER_TRANSFORM}">${body}</g>`;
}

function renderDedePieceSvg(kind) {
  if (kind === "tens") {
    return svgRootExact({
      width: 154,
      height: 85,
      ariaLabel: "Dizaine Dédé",
      body: renderInlineAsset({
        x: 0,
        y: 0,
        width: 154,
        height: 85,
        viewBox: DEDE_VIEWBOX,
        body: wrapDedeBody(DEDE_INLINE_ASSETS.ten.body)
      })
    });
  }

  const r = 8.0697918;
  const stroke = 0.465;
  const size = 18;
  const cx = size / 2;
  const cy = size / 2;
  return svgRootExact({
    width: size,
    height: size,
    ariaLabel: "Unité Dédé",
    body: `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" fill="#33b7e5" stroke="#000" stroke-width="${round(stroke)}" />`
  });
}

function renderTextBlocksSvg(value, options = {}) {
  const safeValue = clampInt(value, 1, 999);
  const { hundreds, tens, ones } = decomposeValue(safeValue);
  const labelMode = normalizeTextBlocksLabelMode(options.labelMode);
  const tileWidth = 132;
  const tileHeight = 132;
  const tileGapX = 16;
  const tileGapY = 14;
  const borderWidth = 1.75;
  const maxColumns = 5;
  const panelPadX = 24;
  const panelPadY = 24;
  const sectionGap = 22;
  const sections = [];

  if (hundreds > 0) {
    sections.push({ kind: "hundred", count: hundreds });
  }
  if (tens > 0) {
    sections.push({ kind: "ten", count: tens });
  }
  if (ones > 0) {
    sections.push({ kind: "unit", count: ones });
  }

  const gridWidth = maxColumns * tileWidth + (maxColumns - 1) * tileGapX;
  const renderedSections = sections.map((section) => ({
    ...section,
    rows: Math.max(1, Math.ceil(section.count / maxColumns)),
    height: Math.max(1, Math.ceil(section.count / maxColumns)) * tileHeight + Math.max(0, Math.ceil(section.count / maxColumns) - 1) * tileGapY
  }));
  const contentHeight = renderedSections.reduce((sum, section) => sum + section.height, 0) + Math.max(0, renderedSections.length - 1) * sectionGap;
  const canvasWidth = gridWidth + panelPadX * 2;
  const canvasHeight = contentHeight + panelPadY * 2;
  const gridStartX = panelPadX;
  let cursorY = panelPadY;
  const bodies = [];

  renderedSections.forEach((section, sectionIndex) => {
    for (let index = 0; index < section.count; index += 1) {
      const row = Math.floor(index / maxColumns);
      const col = index % maxColumns;
      bodies.push(renderTextTile(
        gridStartX + col * (tileWidth + tileGapX),
        cursorY + row * (tileHeight + tileGapY),
        tileWidth,
        tileHeight,
        buildTextBlockLines(section.kind, labelMode),
        borderWidth
      ));
    }
    cursorY += section.height;
    if (sectionIndex < renderedSections.length - 1) {
      cursorY += sectionGap;
    }
  });

  return svgRoot({
    width: canvasWidth,
    height: canvasHeight,
    ariaLabel: `Représentation en tuiles de ${safeValue}`,
    body: bodies.join("")
  });
}

function renderTextTile(x, y, width, height, lines, borderWidth = 1.75) {
  const fontSize = lines.length >= 3 ? 18 : 20;
  const lineHeight = lines.length >= 3 ? 24 : 28;
  const totalTextHeight = lineHeight * Math.max(1, lines.length);
  const startY = y + (height - totalTextHeight) / 2 + fontSize;
  const content = lines.map((line, index) => `
    <text x="${x + width / 2}" y="${startY + index * lineHeight}" text-anchor="middle" font-family="Andika, system-ui, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${escapeHtml(line)}</text>
  `).join("");

  return `
    <rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="0" fill="#a8c85a" stroke="#222" stroke-width="${round(borderWidth)}" />
    ${content}
  `;
}

function buildTextBlockLines(kind, labelMode) {
  switch (labelMode) {
    case TEXT_BLOCKS_LABEL_MODES.FULL_ABRIDGED:
      if (kind === "hundred") return ["1 c", "10 d", "100 u"];
      if (kind === "ten") return ["1 d", "10 u"];
      return ["1 u"];
    case TEXT_BLOCKS_LABEL_MODES.LARGE_CLASS_ONLY:
      if (kind === "hundred") return ["1 centaine"];
      if (kind === "ten") return ["1 dizaine"];
      return ["1 unité"];
    case TEXT_BLOCKS_LABEL_MODES.LARGE_CLASS_ABRIDGED:
      if (kind === "hundred") return ["1 c"];
      if (kind === "ten") return ["1 d"];
      return ["1 u"];
    case TEXT_BLOCKS_LABEL_MODES.FULL_EXPLICIT:
    default:
      if (kind === "hundred") return ["1 centaine", "10 dizaines", "100 unités"];
      if (kind === "ten") return ["1 dizaine", "10 unités"];
      return ["1 unité"];
  }
}

function renderTextBlocksPieceSvg(kind, options = {}) {
  const safeKind = kind === "hundreds" ? "hundred" : kind === "tens" ? "ten" : "unit";
  const labelMode = normalizeTextBlocksLabelMode(options.labelMode);
  return svgRootExact({
    width: 132,
    height: 132,
    ariaLabel: `Tuile ${safeKind}`,
    body: renderTextTile(0, 0, 132, 132, buildTextBlockLines(safeKind, labelMode), 1.75)
  });
}

function renderBlueBase10Svg(value, options = {}) {
  const safeValue = clampInt(value, 1, 999);
  const displayBuild = getBlueDisplayBuild(safeValue, options);
  const hundreds = displayBuild.hundreds;
  const tens = displayBuild.tens;
  const ones = displayBuild.ones;
  const looseTens = displayBuild.looseTens;
  const cell = 18;
  const unitGap = 6;
  const barGap = 8;
  const sectionGap = 22;
  const groupGap = 18;
  const strokeWidth = 0.82;
  const hundredBlockSize = cell * 10;
  const hundredBlockGap = 16;
  const panelPadX = 24;
  const panelPadY = 24;

  const hundredRows = getBlueSectionRows(hundreds, 5);
  const hundredsWidth = Math.max(
    0,
    ...hundredRows.map((count) => count * hundredBlockSize + Math.max(0, count - 1) * hundredBlockGap)
  );
  const hundredsHeight = hundredRows.length
    ? hundredRows.length * hundredBlockSize + Math.max(0, hundredRows.length - 1) * hundredBlockGap
    : 0;

  const unitsSection = buildBlueUnitsSection(ones, cell, unitGap, strokeWidth, {
    twoColumns: options.allowLooseTens === true
  });
  const tensSection = buildBlueTensSection(tens, cell, barGap, groupGap, strokeWidth);
  const looseTensSection = buildBlueLooseTensSection(looseTens, cell, unitGap, groupGap, strokeWidth);
  const sections = [
    hundredRows.length ? { kind: "hundreds", width: hundredsWidth, height: hundredsHeight } : null,
    tensSection.width ? { kind: "tens", width: tensSection.width, height: tensSection.height } : null,
    looseTensSection.width ? { kind: "looseTens", width: looseTensSection.width, height: looseTensSection.height } : null,
    unitsSection.width ? { kind: "ones", width: unitsSection.width, height: unitsSection.height } : null
  ].filter(Boolean);

  const contentWidth = sections.length
    ? sections.reduce((sum, section, index) => sum + section.width + (index > 0 ? sectionGap : 0), 0)
    : cell;
  const contentHeight = sections.length
    ? Math.max(...sections.map((section) => section.height), cell)
    : cell;
  const canvasWidth = contentWidth + panelPadX * 2;
  const canvasHeight = contentHeight + panelPadY * 2;
  const baselineY = panelPadY + contentHeight;
  const body = [];
  let cursorX = panelPadX;

  sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) cursorX += sectionGap;
    const topY = baselineY - section.height;

    if (section.kind === "hundreds") {
      body.push(renderBlueHundredRows(hundredRows, cursorX, topY, section.width, cell, strokeWidth, hundredBlockGap));
    } else if (section.kind === "tens") {
      body.push(`<g transform="translate(${round(cursorX)},${round(topY)})">${tensSection.body}</g>`);
    } else if (section.kind === "looseTens") {
      body.push(`<g transform="translate(${round(cursorX)},${round(topY)})">${looseTensSection.body}</g>`);
    } else if (section.kind === "ones") {
      body.push(`<g transform="translate(${round(cursorX)},${round(topY)})">${unitsSection.body}</g>`);
    }

    cursorX += section.width;
  });

  return svgRoot({
    width: canvasWidth,
    height: canvasHeight,
    ariaLabel: `Représentation en petits carrés de ${safeValue}`,
    body: body.join("")
  });
}

function getBlueSectionRows(count, columns) {
  const rows = [];
  let remaining = Math.max(0, Number(count) || 0);
  while (remaining > 0) {
    const rowCount = Math.min(columns, remaining);
    rows.push(rowCount);
    remaining -= rowCount;
  }
  return rows;
}

function renderBlueHundredRows(rows, x, y, sectionWidth, cell, strokeWidth, gap) {
  const blockSize = cell * 10;
  let cursorY = y;
  return rows.map((count, rowIndex) => {
    let cursorX = x;
    const body = Array.from({ length: count }, () => {
      const block = renderBlueHundredBlock(cursorX, cursorY, cell, strokeWidth);
      cursorX += blockSize + gap;
      return block;
    }).join("");
    cursorY += blockSize + (rowIndex < rows.length - 1 ? gap : 0);
    return body;
  }).join("");
}

function getBlueDisplayBuild(value, options = {}) {
  const decomposition = decomposeValue(value);
  const source = isPlainObject(options.displayBuild) ? options.displayBuild : null;
  const rawOnes = clampInt(source?.ones ?? decomposition.ones, 0, 99);
  const looseTens = clampInt(
    source?.looseTens ?? (source ? Math.floor(rawOnes / 10) : 0),
    0,
    Math.floor(rawOnes / 10)
  );

  return {
    hundreds: clampInt(source?.hundreds ?? decomposition.hundreds, 0, 9),
    tens: clampInt(source?.tens ?? decomposition.tens, 0, 9),
    ones: clampInt(rawOnes - looseTens * 10, 0, 9),
    looseTens
  };
}

function buildBlueUnitsSection(count, cell, gap, strokeWidth, options = {}) {
  if (!count) return { width: 0, height: 0, body: '' };
  if (options.twoColumns === true) {
    return buildBlueUnitColumnsSection(count, cell, gap, strokeWidth);
  }
  const groupGap = gap * 2.35;
  const width = cell;
  const height = cell + getBlueVerticalUnitOffsetFromBottom(count - 1, cell, gap, groupGap);
  const bottomY = height;
  const body = Array.from({ length: count }, (_, index) => {
    const y = bottomY - cell - getBlueVerticalUnitOffsetFromBottom(index, cell, gap, groupGap);
    return renderBlueSquare(0, y, cell, strokeWidth);
  }).join('');
  return { width, height, body };
}

function buildBlueUnitColumnsSection(count, cell, gap, strokeWidth) {
  const safeCount = clampInt(count, 0, 9);
  if (!safeCount) return { width: 0, height: 0, body: '' };
  const width = computeBlueLooseTenBlockWidth(cell, gap);
  const height = computeBlueLooseTenBlockHeight(cell, gap);
  const bottomY = height;
  const body = Array.from({ length: safeCount }, (_, index) => {
    const column = Math.floor(index / 5);
    const rowFromBottom = index % 5;
    const x = column * (cell + gap);
    const y = bottomY - cell - rowFromBottom * (cell + gap);
    return renderBlueSquare(x, y, cell, strokeWidth);
  }).join('');
  return { width, height, body };
}

function buildBlueLooseTensSection(count, cell, gap, groupGap, strokeWidth) {
  const safeCount = clampInt(count, 0, 9);
  if (!safeCount) return { width: 0, height: 0, body: '' };
  const blockWidth = computeBlueLooseTenBlockWidth(cell, gap);
  const blockHeight = computeBlueLooseTenBlockHeight(cell, gap);
  const body = Array.from({ length: safeCount }, (_, blockIndex) => {
    const x = blockIndex * (blockWidth + groupGap);
    return `<g transform="translate(${round(x)},0)">${renderBlueLooseTenBlock(cell, gap, strokeWidth)}</g>`;
  }).join('');
  return {
    width: safeCount * blockWidth + Math.max(0, safeCount - 1) * groupGap,
    height: blockHeight,
    body
  };
}

function computeBlueLooseTenBlockWidth(cell, gap) {
  return 2 * cell + gap;
}

function computeBlueLooseTenBlockHeight(cell, gap) {
  return 5 * cell + 4 * gap;
}

function renderBlueLooseTenBlock(cell, gap, strokeWidth) {
  const bottomY = computeBlueLooseTenBlockHeight(cell, gap);
  return Array.from({ length: 10 }, (_, index) => {
    const column = Math.floor(index / 5);
    const rowFromBottom = index % 5;
    const x = column * (cell + gap);
    const y = bottomY - cell - rowFromBottom * (cell + gap);
    return renderBlueSquare(x, y, cell, strokeWidth);
  }).join('');
}

function getBlueVerticalUnitOffsetFromBottom(index, cell, gap, groupGap) {
  let offset = 0;
  for (let step = 0; step < index; step += 1) {
    offset += cell;
    offset += step === 4 ? groupGap : gap;
  }
  return offset;
}

function buildBlueTensSection(count, cell, barGap, groupGap, strokeWidth) {
  if (!count) return { width: 0, height: 0, body: '' };
  const body = [];
  let cursorY = 0;
  const groups = count > 5 ? [count - 5, 5] : [count];

  groups.forEach((groupCount, groupIndex) => {
    if (groupIndex > 0) {
      cursorY += barGap + groupGap;
    }
    for (let index = 0; index < groupCount; index += 1) {
      body.push(renderBlueTenBar(0, cursorY, cell, strokeWidth));
      cursorY += cell;
      if (index < groupCount - 1) {
        cursorY += barGap;
      }
    }
  });

  return { width: cell * 10, height: cursorY, body: body.join('') };
}

function renderBlueTenBar(x, y, cell, strokeWidth) {
  const squares = Array.from({ length: 10 }, (_, index) => {
    return renderBlueSquare(x + index * cell, y, cell, strokeWidth);
  }).join('');
  return `<g>${squares}</g>`;
}

function renderBlueHundredBlock(x, y, cell, strokeWidth) {
  let squares = '';
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      squares += renderBlueSquare(x + col * cell, y + row * cell, cell, strokeWidth);
    }
  }
  return `<g>${squares}</g>`;
}

function renderBlueSquare(x, y, size, strokeWidth = 0.82) {
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(size)}" height="${round(size)}" fill="#33b7e5" stroke="#111" stroke-width="${round(strokeWidth)}" />`;
}

function renderBlueBase10PieceSvg(kind) {
  if (kind === "hundreds") {
    return svgRootExact({
      width: 180,
      height: 180,
      ariaLabel: "Centaine en petits carrés",
      body: renderBlueHundredBlock(0, 0, 18, 0.72)
    });
  }
  if (kind === "tens") {
    return svgRootExact({
      width: 180,
      height: 18,
      ariaLabel: "Dizaine en petits carrés",
      body: renderBlueTenBar(0, 0, 18, 0.72)
    });
  }
  return svgRootExact({
    width: 18,
    height: 18,
    ariaLabel: "Unité en petits carrés",
    body: renderBlueSquare(0, 0, 18, 0.72)
  });
}

function computeZoneRowsLayout(count, columns, itemHeight, gapY, top, bottom) {
  const rows = Math.max(1, Math.ceil(count / columns));
  const height = rows * itemHeight + Math.max(0, rows - 1) * gapY;
  return {
    startY: top + ((bottom - top) - height) / 2,
    height
  };
}


function renderFallbackSvg(value, themeId) {
  return svgRoot({
    width: 480,
    height: 160,
    ariaLabel: `Représentation indisponible de ${value}`,
    body: `
      <rect x="16" y="16" width="448" height="128" rx="24" fill="#fff" stroke="rgba(0,0,0,.14)" stroke-width="2" />
      <text x="240" y="78" text-anchor="middle" font-family="Andika, system-ui, sans-serif" font-size="28" font-weight="700" fill="#1f2430">Thème indisponible</text>
      <text x="240" y="112" text-anchor="middle" font-family="Andika, system-ui, sans-serif" font-size="20" fill="#4d5566">${escapeHtml(themeId)} — ${value}</text>
    `
  });
}

function renderInlineAsset({ x, y, width, height, viewBox, body }) {
  return `
    <svg x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" viewBox="${viewBox}" aria-hidden="true" overflow="visible">
      ${body}
    </svg>
  `;
}

function svgRootExact({ width, height, ariaLabel, body }) {
  const safeWidth = Math.max(1, Number(width) || 0);
  const safeHeight = Math.max(1, Number(height) || 0);
  return `
    <svg
      class="rd-svg"
      xmlns="http://www.w3.org/2000/svg"
      width="${round(safeWidth)}"
      height="${round(safeHeight)}"
      viewBox="0 0 ${round(safeWidth)} ${round(safeHeight)}"
      role="img"
      aria-label="${escapeHtml(ariaLabel || "Représentation décimale")}">
      ${body}
    </svg>
  `;
}

function svgRoot({ width, height, ariaLabel, body }) {
  const safeWidth = Math.max(120, Math.round(width));
  const safeHeight = Math.max(80, Math.round(height));
  return `
    <svg
      class="rd-svg"
      xmlns="http://www.w3.org/2000/svg"
      width="${safeWidth}"
      height="${safeHeight}"
      viewBox="0 0 ${safeWidth} ${safeHeight}"
      role="img"
      aria-label="${escapeHtml(ariaLabel || "Représentation décimale")}">
      ${body}
    </svg>
  `;
}

function round(value) {
  return Number(value).toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function pickRandom(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const index = Math.floor(Math.random() * values.length);
  return values[index];
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
