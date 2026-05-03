const SETTINGS = {
  viewportSize: 320,
  planetDiameter: 128,
  minPatternLayers: 1,
  maxPatternLayers: 1,
};

const LAYER_ORDER = {
  bands: 10,
  patches: 20,
  veins: 30,
  dust: 35,
  craters: 40,
  spots: 45,
  caps: 55,
  clouds: 65,
};

const BASE_LAYER_NAMES = new Set(["bands", "craters", "patches", "veins"]);
const OVERLAY_LAYER_NAMES = new Set(["clouds", "spots", "dust", "caps"]);

const PATCH_MOTIF_SETTINGS = {
  largeSectorTotalAngleRange: [234, 242],
  interiorNodeCount: [4, 8],
  interiorApexRadiusRange: [0.1, 0.15],
  interiorNodePositionJitter: [0.1, 0.2],
  interiorNodeAngularJitterRange: [10, 22],
  interiorCurveTension: [0.5, 0.8],
};

const BAND_MOTIF_SETTINGS = {
  countRange: [3, 5],
  yInsetRatio: 0.72,
  verticalSpreadRatio: 1.4,
  heightRatioRange: [0.14, 0.22],
  amplitudeRange: [5, 10],
  opacityRange: [0.72, 0.92],
};

const CRATER_MOTIF_SETTINGS = {
  countRange: [5, 9],
  radiusRange: [6, 12],
  flattenRatioRange: [0.38, 0.56],
  innerRingRadiusRatio: 0.5,
  centerPadding: 2,
  collisionGap: 3,
  midShiftRange: [1.5, 3.5],
};

const CLOUD_MOTIF_SETTINGS = {
  clusterCountRange: [8, 12],
  puffCountRange: [3, 5],
  centerSpreadXRatio: 0.86,
  centerSpreadYRatio: 0.82,
  clusterWidthRatioRange: [0.28, 0.44],
  clusterHeightRatioRange: [0.12, 0.2],
  baseWidthRatioRange: [0.4, 0.48],
  baseHeightRatioRange: [0.22, 0.32],
  puffWidthRatioRange: [0.22, 0.34],
  puffHeightRatioRange: [0.28, 0.48],
  colorMixRange: [0.52, 0.74],
};

const SPOT_MOTIF_SETTINGS = {
  countRange: [4, 6],
  radiusRatioRange: [0.14, 0.28],
  flattenRatioRange: [0.45, 0.85],
  colorMixRange: [0.2, 0.8],
};

const DUST_MOTIF_SETTINGS = {
  countRange: [20, 40],
  sizeRatioRange: [0.012, 0.045],
  flattenRatioRange: [0.45, 1],
  colorMixRange: [0.24, 0.42],
};

const CAP_MOTIF_SETTINGS = {
  countRange: [1, 2],
  spanRatioRange: [0.75, 1.05],
  heightRatioRange: [0.18, 0.32],
  offsetRatioRange: [0.76, 0.98],
  edgeNodeCountRange: [3, 6],
  edgePositionJitterRange: [0.16, 0.32],
  edgeDepthJitterRatioRange: [0.1, 0.5],
  edgeCurveTensionRange: [0.58, 0.86],
  colorMixRange: [0.58, 0.84],
};

const VEIN_MOTIF_SETTINGS = {
  countRange: [5, 8],
  pointPositionJitterRange: [0.14, 0.3],
  widthRange: [12, 18],
  colorMixRange: [0.18, 0.3],
  bendRatioRange: [0.5, 0.8],
  directionRotationRange: [0, 20],
  lengthMultiplier: 1.5,
};

const DEFAULT_MOTIF_SETTINGS = {
  bands: BAND_MOTIF_SETTINGS,
  caps: CAP_MOTIF_SETTINGS,
  clouds: CLOUD_MOTIF_SETTINGS,
  craters: CRATER_MOTIF_SETTINGS,
  dust: DUST_MOTIF_SETTINGS,
  patches: PATCH_MOTIF_SETTINGS,
  spots: SPOT_MOTIF_SETTINGS,
  veins: VEIN_MOTIF_SETTINGS,
};

const MOON_SYSTEM_SETTINGS = {
  orbitOffsetXRange: [14, 30],
  orbitOffsetYRange: [10, 24],
  radiusRange: [8, 15],
  craterChance: 0.55,
  craterCountRange: [1, 3],
};

const PLANET_ARCHETYPES = [
  {
    id: "lush",
    label: "Luxuriante",
    weight: 1.1,
    lightOpacityRange: [0.05, 0.08],
    shadowOpacityRange: [0.08, 0.12],
    ringChance: 0.06,
    ringStyles: ["single"],
    moonChance: 0.16,
    moonRange: [0, 1],
    surfaceRotationRange: [-10, 10],
    layerRange: [1, 1],
    primaryLayers: ["patches"],
    overlayLayers: ["clouds"],
    motifOverrides: {
      patches: {
        largeSectorTotalAngleRange: [228, 240],
        interiorNodeCount: [5, 8],
        interiorCurveTension: [0.58, 0.82],
      },
      clouds: {
        clusterCountRange: [9, 13],
        clusterWidthRatioRange: [0.3, 0.48],
        colorMixRange: [0.6, 0.82],
      },
    },
    layerPool: [],
    palettes: [
      { base: "#4ade80", dark: "#22c55e", light: "#86efac", accent: "#dcfce7", ring: "#d9f99d", moon: "#a3e635" },
      { base: "#2dd4bf", dark: "#14b8a6", light: "#5eead4", accent: "#ccfbf1", ring: "#99f6e4", moon: "#67e8f9" },
    ],
  },
  {
    id: "desert",
    label: "Desertique",
    weight: 1,
    lightOpacityRange: [0.04, 0.08],
    shadowOpacityRange: [0.08, 0.12],
    ringChance: 0.08,
    ringStyles: ["single"],
    moonChance: 0.18,
    moonRange: [0, 1],
    surfaceRotationRange: [-8, 8],
    layerRange: [1, 1],
    primaryLayers: ["veins"],
    overlayLayers: ["dust"],
    motifOverrides: {
      veins: {
        countRange: [4, 6],
        widthRange: [10, 14],
        colorMixRange: [0.14, 0.24],
        bendRatioRange: [0.28, 0.46],
      },
      dust: {
        countRange: [28, 44],
        sizeRatioRange: [0.014, 0.05],
        colorMixRange: [0.28, 0.46],
      },
    },
    layerPool: [],
    palettes: [
      { base: "#f59e0b", dark: "#d97706", light: "#fcd34d", accent: "#fef3c7", ring: "#fde68a", moon: "#fdba74" },
      { base: "#fb923c", dark: "#ea580c", light: "#fdba74", accent: "#ffedd5", ring: "#fed7aa", moon: "#fbbf24" },
    ],
  },
  {
    id: "gas_giant",
    label: "Geante gazeuse",
    weight: 0.95,
    lightOpacityRange: [0.03, 0.06],
    shadowOpacityRange: [0.08, 0.12],
    ringChance: 0.38,
    ringStyles: ["single", "double"],
    moonChance: 0.28,
    moonRange: [0, 1],
    surfaceRotationRange: [-16, 16],
    layerRange: [1, 1],
    primaryLayers: ["bands"],
    overlayLayers: ["spots"],
    motifOverrides: {
      bands: {
        countRange: [4, 6],
        heightRatioRange: [0.16, 0.24],
        amplitudeRange: [6, 11],
        opacityRange: [0.76, 0.94],
      },
      spots: {
        countRange: [2, 4],
        radiusRatioRange: [0.18, 0.3],
        flattenRatioRange: [0.5, 0.88],
      },
    },
    layerPool: [],
    palettes: [
      { base: "#0ea5e9", dark: "#0284c7", light: "#38bdf8", accent: "#bae6fd", ring: "#93c5fd", moon: "#93c5fd" },
      { base: "#ef4444", dark: "#dc2626", light: "#f87171", accent: "#fca5a5", ring: "#fecaca", moon: "#f9a8d4" },
      { base: "#f97316", dark: "#ea580c", light: "#fb923c", accent: "#fdba74", ring: "#fed7aa", moon: "#fdba74" },
    ],
  },
  {
    id: "ice",
    label: "Glaciaire",
    weight: 0.9,
    lightOpacityRange: [0.05, 0.08],
    shadowOpacityRange: [0.06, 0.1],
    ringChance: 0.54,
    ringStyles: ["single", "double"],
    moonChance: 0.16,
    moonRange: [0, 1],
    surfaceRotationRange: [-12, 12],
    layerRange: [1, 1],
    primaryLayers: ["bands"],
    overlayLayers: ["caps"],
    motifOverrides: {
      bands: {
        countRange: [4, 6],
        amplitudeRange: [3, 7],
        opacityRange: [0.54, 0.76],
      },
      caps: {
        countRange: [2, 2],
        spanRatioRange: [0.78, 1.08],
        heightRatioRange: [0.18, 0.26],
        edgeDepthJitterRatioRange: [0.06, 0.18],
        colorMixRange: [0.7, 0.9],
      },
    },
    layerPool: [],
    palettes: [
      { base: "#a5f3fc", dark: "#67e8f9", light: "#cffafe", accent: "#ecfeff", ring: "#67c6d9", moon: "#bae6fd" },
      { base: "#93c5fd", dark: "#60a5fa", light: "#dbeafe", accent: "#eff6ff", ring: "#93c5fd", moon: "#cbd5e1" },
    ],
  },
  {
    id: "oceanic",
    label: "Oceanique",
    weight: 0.95,
    lightOpacityRange: [0.04, 0.07],
    shadowOpacityRange: [0.07, 0.11],
    ringChance: 0.1,
    ringStyles: ["single"],
    moonChance: 0.2,
    moonRange: [0, 1],
    surfaceRotationRange: [-10, 10],
    layerRange: [1, 1],
    primaryLayers: ["veins"],
    overlayLayers: ["caps"],
    motifOverrides: {
      veins: {
        countRange: [4, 7],
        widthRange: [10, 15],
        colorMixRange: [0.1, 0.2],
        bendRatioRange: [0.18, 0.36],
        directionRotationRange: [0, 12],
      },
      caps: {
        spanRatioRange: [0.66, 0.9],
        heightRatioRange: [0.14, 0.22],
        colorMixRange: [0.5, 0.7],
      },
    },
    layerPool: [],
    palettes: [
      { base: "#38bdf8", dark: "#0ea5e9", light: "#7dd3fc", accent: "#e0f2fe", ring: "#bae6fd", moon: "#93c5fd" },
      { base: "#06b6d4", dark: "#0891b2", light: "#67e8f9", accent: "#cffafe", ring: "#a5f3fc", moon: "#67e8f9" },
      { base: "#3b82f6", dark: "#2563eb", light: "#93c5fd", accent: "#dbeafe", ring: "#bfdbfe", moon: "#93c5fd" },
    ],
  },
  {
    id: "volcanic",
    label: "Volcanique",
    weight: 0.9,
    lightOpacityRange: [0.03, 0.06],
    shadowOpacityRange: [0.1, 0.14],
    ringChance: 0.06,
    ringStyles: ["single"],
    moonChance: 0.12,
    moonRange: [0, 1],
    surfaceRotationRange: [-8, 8],
    layerRange: [1, 1],
    primaryLayers: ["craters"],
    overlayLayers: ["clouds"],
    motifOverrides: {
      craters: {
        countRange: [6, 10],
        radiusRange: [7, 13],
        innerRingRadiusRatio: 0.44,
        collisionGap: 4,
        midShiftRange: [2, 4.5],
      },
      clouds: {
        clusterCountRange: [5, 9],
        clusterWidthRatioRange: [0.24, 0.38],
        colorMixRange: [0.34, 0.52],
      },
    },
    layerPool: [],
    palettes: [
      { base: "#ef4444", dark: "#dc2626", light: "#f87171", accent: "#fee2e2", ring: "#fecaca", moon: "#fb7185" },
      { base: "#f97316", dark: "#ea580c", light: "#fb923c", accent: "#ffedd5", ring: "#fdba74", moon: "#fbbf24" },
    ],
  },
  {
    id: "rocky",
    label: "Rocheuse",
    weight: 1,
    lightOpacityRange: [0.03, 0.05],
    shadowOpacityRange: [0.08, 0.12],
    ringChance: 0.04,
    ringStyles: ["single"],
    moonChance: 0.12,
    moonRange: [0, 1],
    surfaceRotationRange: [-6, 6],
    layerRange: [1, 1],
    primaryLayers: ["craters"],
    overlayLayers: ["dust"],
    motifOverrides: {
      craters: {
        countRange: [5, 8],
        radiusRange: [5, 10],
        flattenRatioRange: [0.34, 0.5],
        midShiftRange: [1.2, 2.8],
      },
      dust: {
        countRange: [18, 28],
        sizeRatioRange: [0.01, 0.032],
        colorMixRange: [0.18, 0.32],
      },
    },
    layerPool: [],
    palettes: [
      { base: "#a1a1aa", dark: "#71717a", light: "#d4d4d8", accent: "#e4e4e7", ring: "#d6d3d1", moon: "#d6d3d1" },
      { base: "#a8a29e", dark: "#78716c", light: "#e7e5e4", accent: "#fafaf9", ring: "#d6d3d1", moon: "#d6d3d1" },
    ],
  },
  {
    id: "toxic",
    label: "Toxique",
    weight: 0.85,
    lightOpacityRange: [0.04, 0.07],
    shadowOpacityRange: [0.08, 0.12],
    ringChance: 0.12,
    ringStyles: ["single"],
    moonChance: 0.16,
    moonRange: [0, 1],
    surfaceRotationRange: [-12, 12],
    layerRange: [1, 1],
    primaryLayers: ["patches"],
    overlayLayers: ["spots"],
    motifOverrides: {
      patches: {
        largeSectorTotalAngleRange: [230, 246],
        interiorNodeAngularJitterRange: [14, 28],
        interiorCurveTension: [0.42, 0.68],
      },
      spots: {
        countRange: [5, 8],
        radiusRatioRange: [0.12, 0.22],
        flattenRatioRange: [0.42, 0.74],
        colorMixRange: [0.28, 0.5],
      },
    },
    layerPool: [],
    palettes: [
      { base: "#84cc16", dark: "#65a30d", light: "#bef264", accent: "#ecfccb", ring: "#d9f99d", moon: "#a3e635" },
      { base: "#14b8a6", dark: "#0d9488", light: "#5eead4", accent: "#ccfbf1", ring: "#99f6e4", moon: "#2dd4bf" },
    ],
  },
];

const PATTERN_BUILDERS = {
  bands: buildBands,
  caps: buildCaps,
  clouds: buildClouds,
  craters: buildCraters,
  dust: buildDust,
  patches: buildPatches,
  spots: buildSpots,
  veins: buildVeins,
};

let planetInstanceCounter = 0;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function weightedPick(random, list) {
  const total = list.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  let roll = random() * total;

  for (const item of list) {
    roll -= item.weight ?? 1;
    if (roll <= 0) {
      return item;
    }
  }

  return list[list.length - 1];
}

function randomBetween(random, min, max) {
  return min + (max - min) * random();
}

function randomInt(random, min, max) {
  return Math.floor(randomBetween(random, min, max + 1));
}

function normalizeSettingRange(value) {
  if (Array.isArray(value)) {
    const left = Number(value[0]);
    const right = Number(value[1]);

    return left <= right ? [left, right] : [right, left];
  }

  const numericValue = Number(value);
  return [numericValue, numericValue];
}

function randomBetweenSetting(random, value) {
  const [min, max] = normalizeSettingRange(value);
  return min === max ? min : randomBetween(random, min, max);
}

function randomIntBetweenSetting(random, value) {
  const [min, max] = normalizeSettingRange(value);
  const roundedMin = Math.round(min);
  const roundedMax = Math.round(max);
  return roundedMin === roundedMax ? roundedMin : randomInt(random, roundedMin, roundedMax);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
  return Number(value).toFixed(2);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case red:
        h = ((green - blue) / delta) % 6;
        break;
      case green:
        h = (blue - red) / delta + 2;
        break;
      default:
        h = (red - green) / delta + 4;
        break;
    }

    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  return { h, s, l };
}

function hueToRgb(p, q, t) {
  let value = t;

  if (value < 0) {
    value += 1;
  }
  if (value > 1) {
    value -= 1;
  }
  if (value < 1 / 6) {
    return p + (q - p) * 6 * value;
  }
  if (value < 1 / 2) {
    return q;
  }
  if (value < 2 / 3) {
    return p + (q - p) * (2 / 3 - value) * 6;
  }
  return p;
}

function hslToRgb({ h, s, l }) {
  const hue = ((h % 360) + 360) % 360 / 360;

  if (s === 0) {
    const channel = l * 255;
    return { r: channel, g: channel, b: channel };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
  };
}

function mixColors(colorA, colorB, ratio = 0.5) {
  const left = hexToRgb(colorA);
  const right = hexToRgb(colorB);

  return rgbToHex({
    r: left.r + (right.r - left.r) * ratio,
    g: left.g + (right.g - left.g) * ratio,
    b: left.b + (right.b - left.b) * ratio,
  });
}

function shiftColorTone(color, hueShift, saturationShift = 0, lightnessShift = 0) {
  const hsl = rgbToHsl(hexToRgb(color));

  return rgbToHex(hslToRgb({
    h: hsl.h + hueShift,
    s: clamp(hsl.s + saturationShift, 0, 1),
    l: clamp(hsl.l + lightnessShift, 0, 1),
  }));
}

function nextSeed() {
  return `planet-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// Inline SVG ids must stay unique on a page, even when two tiles share the same seed.
function createInstanceId(seed) {
  planetInstanceCounter += 1;
  return `planet-${hashString(String(seed))}-${planetInstanceCounter}`;
}

function polarToCartesian(cx, cy, rx, ry, angleDeg, rotationDeg = 0) {
  const angle = (angleDeg * Math.PI) / 180;
  const rotation = (rotationDeg * Math.PI) / 180;
  const x = rx * Math.cos(angle);
  const y = ry * Math.sin(angle);

  return {
    x: cx + x * Math.cos(rotation) - y * Math.sin(rotation),
    y: cy + x * Math.sin(rotation) + y * Math.cos(rotation),
  };
}

function describeEllipseArc(cx, cy, rx, ry, startAngle, endAngle, rotationDeg = 0) {
  const start = polarToCartesian(cx, cy, rx, ry, startAngle, rotationDeg);
  const end = polarToCartesian(cx, cy, rx, ry, endAngle, rotationDeg);
  const delta = ((endAngle - startAngle) % 360 + 360) % 360;
  const largeArcFlag = delta > 180 ? 1 : 0;

  return [
    `M ${formatNumber(start.x)} ${formatNumber(start.y)}`,
    `A ${formatNumber(rx)} ${formatNumber(ry)} ${formatNumber(rotationDeg)} ${largeArcFlag} 1 ${formatNumber(end.x)} ${formatNumber(end.y)}`,
  ].join(" ");
}

function makeSvgTag(content, size, label) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${size}"
         height="${size}"
         viewBox="0 0 ${size} ${size}"
         role="img"
         aria-label="${label}">
      ${content}
    </svg>
  `;
}

function resolveArchetype(random, forcedId) {
  if (forcedId) {
    const forced = PLANET_ARCHETYPES.find((item) => item.id === forcedId);
    if (forced) {
      return forced;
    }
  }

  return weightedPick(random, PLANET_ARCHETYPES);
}

function buildPlanetGeometry(settings) {
  const size = settings.viewportSize;
  const radius = settings.planetDiameter / 2;

  return {
    size,
    cx: size / 2,
    cy: size / 2,
    rx: radius,
    ry: radius,
  };
}

function usesSurfaceRotation(layerName) {
  return layerName === "bands";
}

function resolveLayerSettings(archetype, layerName) {
  return {
    ...(DEFAULT_MOTIF_SETTINGS[layerName] ?? {}),
    ...(archetype.motifOverrides?.[layerName] ?? {}),
  };
}

function createLayerSpec(random, seed, archetype, layerName, index, surfaceRotation) {
  return {
    name: layerName,
    seed: hashString(`${seed}:${archetype.id}:${layerName}:${index}:${Math.floor(random() * 1e9)}`),
    density: randomBetween(random, 0.92, 1.08),
    opacity: randomBetween(random, 0.5, 0.72),
    motifSettings: resolveLayerSettings(archetype, layerName),
    rotation: usesSurfaceRotation(layerName)
      ? surfaceRotation + randomBetween(random, -4, 4)
      : randomBetween(random, -14, 14),
  };
}

function buildLayerSpecs(random, seed, archetype, settings, surfaceRotation) {
  const baseTargetCount = clamp(
    randomInt(random, archetype.layerRange[0], archetype.layerRange[1]),
    settings.minPatternLayers,
    settings.maxPatternLayers,
  );
  const selectedNames = [];
  const basePool = (archetype.layerPool ?? []).filter((item) => BASE_LAYER_NAMES.has(item.name));

  function addLayer(layerName, allowedSet) {
    if (!allowedSet.has(layerName) || selectedNames.includes(layerName)) {
      return;
    }

    selectedNames.push(layerName);
  }

  for (const layerName of archetype.primaryLayers) {
    addLayer(layerName, BASE_LAYER_NAMES);
    if (selectedNames.length >= baseTargetCount) {
      break;
    }
  }

  while (selectedNames.length < baseTargetCount && basePool.length > 0) {
    const choice = weightedPick(random, basePool);
    addLayer(choice.name, BASE_LAYER_NAMES);
    basePool.splice(basePool.findIndex((item) => item.name === choice.name), 1);
  }

  for (const layerName of archetype.overlayLayers ?? []) {
    addLayer(layerName, OVERLAY_LAYER_NAMES);
  }

  return selectedNames
    .sort((left, right) => (LAYER_ORDER[left] ?? 0) - (LAYER_ORDER[right] ?? 0))
    .map((layerName, index) => createLayerSpec(random, seed, archetype, layerName, index, surfaceRotation));
}

function buildRingSystem(random, archetype, palette, geometry) {
  if (random() >= archetype.ringChance) {
    return null;
  }

  const style = pick(random, archetype.ringStyles);
  const bandCount = style === "double" ? 2 : 1;
  const rotation = randomBetween(random, -30, 30);
  const baseRx = geometry.rx + randomBetween(random, 18, 28);
  const baseRy = geometry.ry * randomBetween(random, 0.3, 0.36);
  const frontStart = 16;
  const frontEnd = 164;
  const tones = [palette.ring, palette.light];
  const bands = [];

  for (let i = 0; i < bandCount; i++) {
    const offset = i * randomBetween(random, 7, 10);
    const width = randomBetween(random, 4, 8);
    bands.push({
      rx: baseRx + offset,
      ry: baseRy + offset * 0.18,
      width,
      color: tones[i % tones.length],
      opacity: randomBetween(random, 0.86, 0.96),
      frontStart,
      frontEnd,
    });
  }

  return {
    style,
    rotation,
    bands,
  };
}

function buildMoonSystem(random, archetype, palette, geometry) {
  if (random() >= archetype.moonChance) {
    return [];
  }

  const moonCount = randomInt(random, archetype.moonRange[0], archetype.moonRange[1]);
  const moons = [];

  for (let i = 0; i < moonCount; i++) {
    const angle = randomBetween(random, 0, Math.PI * 2);
    const orbitRx = geometry.rx + randomBetweenSetting(random, MOON_SYSTEM_SETTINGS.orbitOffsetXRange);
    const orbitRy = geometry.ry + randomBetweenSetting(random, MOON_SYSTEM_SETTINGS.orbitOffsetYRange);
    const radius = randomBetweenSetting(random, MOON_SYSTEM_SETTINGS.radiusRange);
    const x = geometry.cx + Math.cos(angle) * orbitRx;
    const y = geometry.cy + Math.sin(angle) * orbitRy;
    const craterCount = random() < MOON_SYSTEM_SETTINGS.craterChance
      ? randomInt(
          random,
          MOON_SYSTEM_SETTINGS.craterCountRange[0],
          MOON_SYSTEM_SETTINGS.craterCountRange[1]
        )
      : 0;

    moons.push({
      x,
      y,
      radius,
      base: pick(random, [palette.moon, palette.light, palette.ring]),
      shadow: palette.dark,
      craterSeed: hashString(`moon:${i}:${Math.floor(random() * 1e9)}`),
      craterCount,
    });
  }

  return moons;
}

function buildPlanetProfile(random, seed, archetype, palette, settings, geometry, flatten) {
  const surfaceRotation = randomBetween(random, archetype.surfaceRotationRange[0], archetype.surfaceRotationRange[1]);

  return {
    id: archetype.id,
    label: archetype.label,
    palette,
    flatten,
    lightAngle: randomBetween(random, -165, 165),
    lightOpacity: randomBetween(random, archetype.lightOpacityRange[0], archetype.lightOpacityRange[1]),
    shadowOpacity: randomBetween(random, archetype.shadowOpacityRange[0], archetype.shadowOpacityRange[1]),
    surfaceRotation,
    layers: buildLayerSpecs(random, seed, archetype, settings, surfaceRotation),
    ringSystem: buildRingSystem(random, archetype, palette, geometry),
    moons: buildMoonSystem(random, archetype, palette, geometry),
  };
}

function buildPlanetMarkup(instanceId, geometry, profile) {
  const { cx, cy, rx, ry } = geometry;
  const clipId = `planetClip-${instanceId}`;
  const defs = [
    `
      <clipPath id="${clipId}">
        <ellipse cx="${formatNumber(cx)}" cy="${formatNumber(cy)}" rx="${formatNumber(rx)}" ry="${formatNumber(ry)}" />
      </clipPath>
    `,
  ];

  const backItems = [];
  const frontItems = [];
  const surfaceItems = [
    `
      <ellipse
        cx="${formatNumber(cx)}"
        cy="${formatNumber(cy)}"
        rx="${formatNumber(rx)}"
        ry="${formatNumber(ry)}"
        fill="${profile.palette.base}"
      />
    `,
  ];

  if (profile.ringSystem) {
    for (const band of profile.ringSystem.bands) {
      backItems.push(`
        <ellipse
          cx="${formatNumber(cx)}"
          cy="${formatNumber(cy)}"
          rx="${formatNumber(band.rx)}"
          ry="${formatNumber(band.ry)}"
          transform="rotate(${formatNumber(profile.ringSystem.rotation)} ${formatNumber(cx)} ${formatNumber(cy)})"
          fill="none"
          stroke="${band.color}"
          stroke-width="${formatNumber(band.width)}"
          opacity="${formatNumber(band.opacity)}"
        />
      `);

      const frontArc = describeEllipseArc(
        cx,
        cy,
        band.rx,
        band.ry,
        band.frontStart,
        band.frontEnd,
        profile.ringSystem.rotation,
      );

      frontItems.push(`
        <path
          d="${frontArc}"
          fill="none"
          stroke="${band.color}"
          stroke-width="${formatNumber(band.width)}"
          stroke-linecap="round"
          opacity="${formatNumber(band.opacity)}"
        />
      `);
    }
  }

  for (const moon of profile.moons) {
    const moonItems = [
      `
        <circle
          cx="${formatNumber(moon.x)}"
          cy="${formatNumber(moon.y)}"
          r="${formatNumber(moon.radius)}"
          fill="${moon.base}"
          opacity="0.98"
        />
      `,
    ];

    if (moon.craterCount > 0) {
      const moonRandom = mulberry32(moon.craterSeed);
      for (let i = 0; i < moon.craterCount; i++) {
        const craterX = moon.x + randomBetween(moonRandom, -moon.radius * 0.36, moon.radius * 0.36);
        const craterY = moon.y + randomBetween(moonRandom, -moon.radius * 0.36, moon.radius * 0.36);
        const craterRx = randomBetween(moonRandom, moon.radius * 0.12, moon.radius * 0.24);
        const craterRy = randomBetween(moonRandom, moon.radius * 0.08, moon.radius * 0.18);

        moonItems.push(`
          <ellipse
            cx="${formatNumber(craterX)}"
            cy="${formatNumber(craterY)}"
            rx="${formatNumber(craterRx)}"
            ry="${formatNumber(craterRy)}"
            fill="${moon.shadow}"
            opacity="0.2"
          />
        `);
      }
    }

    backItems.push(moonItems.join(""));
  }

  for (const layer of profile.layers) {
    const builder = PATTERN_BUILDERS[layer.name];
    if (!builder) {
      continue;
    }

    surfaceItems.push(builder(mulberry32(layer.seed), {
      cx,
      cy,
      rx,
      ry,
      clipId,
      palette: profile.palette,
      layer,
    }));
  }

  surfaceItems.push(buildLightOverlay(geometry, profile, clipId));

  return `
    <defs>
      ${defs.join("")}
    </defs>
    ${backItems.join("")}
    <g>
      ${surfaceItems.join("")}
    </g>
    ${frontItems.join("")}
  `;
}

function buildLightOverlay(geometry, profile, clipId) {
  const { cx, cy, rx, ry } = geometry;
  const angle = (profile.lightAngle * Math.PI) / 180;
  const shadowX = cx - Math.cos(angle) * rx * 0.38;
  const shadowY = cy - Math.sin(angle) * ry * 0.38;
  const lightX = cx + Math.cos(angle) * rx * 0.44;
  const lightY = cy + Math.sin(angle) * ry * 0.44;

  return `
    <g clip-path="url(#${clipId})">
      <ellipse
        cx="${formatNumber(shadowX)}"
        cy="${formatNumber(shadowY)}"
        rx="${formatNumber(rx * 0.72)}"
        ry="${formatNumber(ry * 0.72)}"
        fill="${profile.palette.dark}"
        opacity="${formatNumber(profile.shadowOpacity)}"
      />
      <ellipse
        cx="${formatNumber(lightX)}"
        cy="${formatNumber(lightY)}"
        rx="${formatNumber(rx * 0.32)}"
        ry="${formatNumber(ry * 0.28)}"
        fill="${profile.palette.accent}"
        opacity="${formatNumber(profile.lightOpacity)}"
      />
    </g>
  `;
}

function wrapLayer(items, clipId, layer, cx, cy) {
  const transform = Math.abs(layer.rotation) > 0.01
    ? ` transform="rotate(${formatNumber(layer.rotation)} ${formatNumber(cx)} ${formatNumber(cy)})"`
    : "";

  return `<g clip-path="url(#${clipId})"${transform}>${items.join("")}</g>`;
}

function createSmoothCurveCommands(points, tension = 0.92) {
  let commands = "";

  for (let i = 0; i < points.length - 1; i++) {
    const previous = i === 0 ? points[i] : points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const following = i + 2 < points.length ? points[i + 2] : next;
    const cp1X = current.x + ((next.x - previous.x) * tension) / 6;
    const cp1Y = current.y + ((next.y - previous.y) * tension) / 6;
    const cp2X = next.x - ((following.x - current.x) * tension) / 6;
    const cp2Y = next.y - ((following.y - current.y) * tension) / 6;

    commands += `
      C ${formatNumber(cp1X)} ${formatNumber(cp1Y)},
        ${formatNumber(cp2X)} ${formatNumber(cp2Y)},
        ${formatNumber(next.x)} ${formatNumber(next.y)}
    `;
  }

  return commands;
}

function createJitteredFractions(random, nodeCount, jitter) {
  const step = 1 / (nodeCount + 1);
  const fractions = [];

  for (let i = 0; i < nodeCount; i++) {
    const baseFraction = (i + 1) * step;
    fractions.push(clamp(
      baseFraction + randomBetween(random, -step * jitter, step * jitter),
      step * 0.35,
      1 - step * 0.35,
    ));
  }

  return fractions.sort((left, right) => left - right);
}

function distanceBetweenPoints(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function samplePointOnPolyline(points, fraction) {
  const segments = [];
  let totalLength = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const length = distanceBetweenPoints(points[i], points[i + 1]);
    segments.push({
      start: points[i],
      end: points[i + 1],
      length,
    });
    totalLength += length;
  }

  const targetDistance = totalLength * fraction;
  let walked = 0;

  for (const segment of segments) {
    if (walked + segment.length >= targetDistance) {
      const localFraction = segment.length === 0
        ? 0
        : (targetDistance - walked) / segment.length;

      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * localFraction,
        y: segment.start.y + (segment.end.y - segment.start.y) * localFraction,
      };
    }

    walked += segment.length;
  }

  return points[points.length - 1];
}

function randomPointInEllipse(random, cx, cy, rx, ry) {
  const angle = randomBetween(random, 0, Math.PI * 2);
  const distance = Math.sqrt(random());

  return {
    x: cx + Math.cos(angle) * rx * distance,
    y: cy + Math.sin(angle) * ry * distance,
  };
}

function displacePointAroundCenter(random, point, cx, cy, patchSettings) {
  const radius = distanceBetweenPoints({ x: cx, y: cy }, point);
  const baseAngle = Math.atan2(point.y - cy, point.x - cx);
  const angularJitterDeg = random() < 0.5
    ? -randomBetween(
      random,
      patchSettings.interiorNodeAngularJitterRange[0],
      patchSettings.interiorNodeAngularJitterRange[1],
    )
    : randomBetween(
      random,
      patchSettings.interiorNodeAngularJitterRange[0],
      patchSettings.interiorNodeAngularJitterRange[1],
    );
  const angle = baseAngle + (angularJitterDeg * Math.PI) / 180;

  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function createPatchInteriorPoints(random, cx, cy, rx, ry, startPoint, endPoint, patchSettings) {
  const planetRadius = Math.min(rx, ry);
  const startAngle = Math.atan2(startPoint.y - cy, startPoint.x - cx);
  const endAngle = Math.atan2(endPoint.y - cy, endPoint.x - cx);
  let delta = endAngle - startAngle;

  while (delta <= -Math.PI) {
    delta += Math.PI * 2;
  }
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }

  const bisectorAngle = startAngle + delta / 2;
  const apexRadius = planetRadius * randomBetween(
    random,
    patchSettings.interiorApexRadiusRange[0],
    patchSettings.interiorApexRadiusRange[1],
  );
  const apexPoint = {
    x: cx + Math.cos(bisectorAngle) * apexRadius,
    y: cy + Math.sin(bisectorAngle) * apexRadius,
  };
  const basePolyline = [
    startPoint,
    apexPoint,
    endPoint,
  ];
  const interiorNodeCount = randomIntBetweenSetting(random, patchSettings.interiorNodeCount);
  const interiorNodePositionJitter = randomBetweenSetting(random, patchSettings.interiorNodePositionJitter);
  const fractions = createJitteredFractions(
    random,
    interiorNodeCount,
    interiorNodePositionJitter,
  );

  return [
    startPoint,
    ...fractions.map((fraction) => displacePointAroundCenter(
      random,
      samplePointOnPolyline(basePolyline, fraction),
      cx,
      cy,
      patchSettings,
    )),
    endPoint,
  ];
}

function createPatchSectorPath(random, cx, cy, rx, ry, startAngle, endAngle, patchSettings) {
  const startPoint = polarToCartesian(cx, cy, rx, ry, startAngle);
  const endPoint = polarToCartesian(cx, cy, rx, ry, endAngle);
  const interiorPoints = createPatchInteriorPoints(random, cx, cy, rx, ry, startPoint, endPoint, patchSettings);
  const interiorCurveTension = randomBetweenSetting(random, patchSettings.interiorCurveTension);
  const delta = ((endAngle - startAngle) % 360 + 360) % 360;
  const largeArcFlag = delta > 180 ? 1 : 0;

  return `
    M ${formatNumber(startPoint.x)} ${formatNumber(startPoint.y)}
    ${createSmoothCurveCommands(interiorPoints, interiorCurveTension)}
    A ${formatNumber(rx)} ${formatNumber(ry)} 0 ${largeArcFlag} 0 ${formatNumber(startPoint.x)} ${formatNumber(startPoint.y)}
    Z
  `;
}

function createRibbonPath(cx, y, rx, height, amplitude) {
  return `
    M ${formatNumber(cx - rx - 18)} ${formatNumber(y)}
    C ${formatNumber(cx - rx * 0.6)} ${formatNumber(y - amplitude)},
      ${formatNumber(cx - rx * 0.12)} ${formatNumber(y + amplitude)},
      ${formatNumber(cx + rx * 0.26)} ${formatNumber(y)}
    S ${formatNumber(cx + rx * 0.86)} ${formatNumber(y - amplitude)},
      ${formatNumber(cx + rx + 18)} ${formatNumber(y)}
    L ${formatNumber(cx + rx + 18)} ${formatNumber(y + height)}
    C ${formatNumber(cx + rx * 0.7)} ${formatNumber(y + height + amplitude)},
      ${formatNumber(cx + rx * 0.12)} ${formatNumber(y + height - amplitude)},
      ${formatNumber(cx - rx * 0.28)} ${formatNumber(y + height)}
    S ${formatNumber(cx - rx * 0.8)} ${formatNumber(y + height + amplitude)},
      ${formatNumber(cx - rx - 18)} ${formatNumber(y + height)}
    Z
  `;
}

function craterCollides(candidate, placedCraters, gap = 3) {
  return placedCraters.some((placed) => {
    const dx = candidate.x - placed.x;
    const dy = candidate.y - placed.y;
    const minDistance = candidate.rx + placed.rx + gap;

    return dx * dx + dy * dy < minDistance * minDistance;
  });
}

function buildBands(random, context) {
  const { cx, cy, rx, ry, clipId, palette, layer } = context;
  const bandSettings = layer.motifSettings ?? BAND_MOTIF_SETTINGS;
  const count = clamp(
    Math.round(randomIntBetweenSetting(random, bandSettings.countRange) * layer.density),
    bandSettings.countRange[0],
    bandSettings.countRange[1],
  );
  const items = [];
  const colors = [palette.light, palette.dark, palette.light, palette.accent];

  for (let i = 0; i < count; i++) {
    const y = cy
      - ry * bandSettings.yInsetRatio
      + (i / Math.max(1, count - 1)) * ry * bandSettings.verticalSpreadRatio;
    const height = ry * randomBetweenSetting(random, bandSettings.heightRatioRange);
    const amplitude = randomBetweenSetting(random, bandSettings.amplitudeRange);
    const color = colors[i % colors.length];

    items.push(`
        <path
          d="${createRibbonPath(cx, y, rx, height, amplitude)}"
          fill="${color}"
          opacity="${formatNumber(randomBetweenSetting(random, bandSettings.opacityRange))}"
        />
      `);
  }

  return wrapLayer(items, clipId, layer, cx, cy);
}

function buildClouds(random, context) {
  const { cx, cy, rx, ry, clipId, palette, layer } = context;
  const cloudSettings = layer.motifSettings ?? CLOUD_MOTIF_SETTINGS;
  const planetRadius = Math.min(rx, ry);
  const clusterCount = clamp(
    Math.round(randomIntBetweenSetting(random, cloudSettings.clusterCountRange) * layer.density),
    cloudSettings.clusterCountRange[0],
    cloudSettings.clusterCountRange[1],
  );
  const items = [];

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex++) {
    const center = randomPointInEllipse(
      random,
      cx,
      cy,
      rx * cloudSettings.centerSpreadXRatio,
      ry * cloudSettings.centerSpreadYRatio,
    );
    const clusterWidth = planetRadius * randomBetweenSetting(random, cloudSettings.clusterWidthRatioRange);
    const clusterHeight = planetRadius * randomBetweenSetting(random, cloudSettings.clusterHeightRatioRange);
    const puffCount = randomIntBetweenSetting(random, cloudSettings.puffCountRange);
    const fill = mixColors(
      palette.base,
      random() < 0.5 ? palette.light : palette.accent,
      randomBetweenSetting(random, cloudSettings.colorMixRange),
    );

    items.push(`
        <ellipse
          cx="${formatNumber(center.x)}"
          cy="${formatNumber(center.y + clusterHeight * 0.1)}"
          rx="${formatNumber(clusterWidth * randomBetweenSetting(random, cloudSettings.baseWidthRatioRange))}"
          ry="${formatNumber(clusterHeight * randomBetweenSetting(random, cloudSettings.baseHeightRatioRange))}"
          fill="${fill}"
        />
    `);

    for (let puffIndex = 0; puffIndex < puffCount; puffIndex++) {
      const fraction = puffCount === 1 ? 0.5 : puffIndex / (puffCount - 1);
      const puffX = center.x + (fraction - 0.5) * clusterWidth * randomBetween(random, 0.72, 0.94);
      const puffY = center.y
        + randomBetween(random, -clusterHeight * 0.16, clusterHeight * 0.1)
        - Math.sin(fraction * Math.PI) * clusterHeight * 0.08;
      const puffRx = clusterWidth * randomBetweenSetting(random, cloudSettings.puffWidthRatioRange);
      const puffRy = clusterHeight * randomBetweenSetting(random, cloudSettings.puffHeightRatioRange);

      items.push(`
        <ellipse
          cx="${formatNumber(puffX)}"
          cy="${formatNumber(puffY)}"
          rx="${formatNumber(puffRx)}"
          ry="${formatNumber(puffRy)}"
          fill="${fill}"
        />
      `);
    }
  }

  return wrapLayer(items, clipId, layer, cx, cy);
}

function createAccidentedCapPath(random, capCx, capCy, span, height, direction, capSettings) {
  const nodeCount = randomIntBetweenSetting(random, capSettings.edgeNodeCountRange);
  const positionJitter = randomBetweenSetting(random, capSettings.edgePositionJitterRange);
  const depthJitterRatio = randomBetweenSetting(random, capSettings.edgeDepthJitterRatioRange);
  const curveTension = randomBetweenSetting(random, capSettings.edgeCurveTensionRange);
  const fractions = [0, ...createJitteredFractions(random, nodeCount, positionJitter), 1];
  const boundaryPoints = fractions.map((fraction) => {
    const arcDepth = Math.sin(fraction * Math.PI);
    const depth = height * (
      0.38
      + arcDepth * 0.72
      + randomBetween(random, -depthJitterRatio, depthJitterRatio) * Math.max(0.2, arcDepth)
    );

    return {
      x: capCx + (fraction - 0.5) * span * 2,
      y: capCy - direction * depth,
    };
  });
  const outerY = capCy + direction * height * 2.4;
  const leftOutsideX = capCx - span * 1.24;
  const rightOutsideX = capCx + span * 1.24;

  return `
    M ${formatNumber(boundaryPoints[0].x)} ${formatNumber(boundaryPoints[0].y)}
    ${createSmoothCurveCommands(boundaryPoints, curveTension)}
    L ${formatNumber(rightOutsideX)} ${formatNumber(outerY)}
    L ${formatNumber(leftOutsideX)} ${formatNumber(outerY)}
    Z
  `;
}

function buildCaps(random, context) {
  const { cx, cy, rx, ry, clipId, palette, layer } = context;
  const capSettings = layer.motifSettings ?? CAP_MOTIF_SETTINGS;
  const capCount = randomIntBetweenSetting(random, capSettings.countRange);
  const positions = capCount === 2
    ? [-1, 1]
    : [random() < 0.5 ? -1 : 1];
  const items = [];

  for (const direction of positions) {
    const fill = mixColors(
      palette.base,
      random() < 0.5 ? palette.light : palette.accent,
      randomBetweenSetting(random, capSettings.colorMixRange),
    );
    const span = rx * randomBetweenSetting(random, capSettings.spanRatioRange);
    const height = ry * randomBetweenSetting(random, capSettings.heightRatioRange);
    const offset = ry * randomBetweenSetting(random, capSettings.offsetRatioRange);
    const capCx = cx + randomBetween(random, -rx * 0.08, rx * 0.08);
    const capCy = cy + direction * offset;

    items.push(`
      <path
        d="${createAccidentedCapPath(random, capCx, capCy, span, height, direction, capSettings)}"
        fill="${fill}"
      />
    `);
  }

  return wrapLayer(items, clipId, layer, cx, cy);
}

function buildDust(random, context) {
  const { cx, cy, rx, ry, clipId, palette, layer } = context;
  const dustSettings = layer.motifSettings ?? DUST_MOTIF_SETTINGS;
  const planetRadius = Math.min(rx, ry);
  const count = clamp(
    Math.round(randomIntBetweenSetting(random, dustSettings.countRange) * layer.density),
    dustSettings.countRange[0],
    dustSettings.countRange[1],
  );
  const baseColor = mixColors(
    palette.base,
    palette.dark,
    randomBetweenSetting(random, dustSettings.colorMixRange),
  );
  const items = [];

  for (let index = 0; index < count; index++) {
    const center = randomPointInEllipse(random, cx, cy, rx, ry);
    const radius = planetRadius * randomBetweenSetting(random, dustSettings.sizeRatioRange);
    const flatten = randomBetweenSetting(random, dustSettings.flattenRatioRange);
    const rotation = randomBetween(random, 0, 180);
    const fill = shiftColorTone(
      baseColor,
      randomBetween(random, -6, 6),
      randomBetween(random, -0.03, 0.03),
      randomBetween(random, -0.03, 0.03),
    );

    items.push(`
      <ellipse
        cx="${formatNumber(center.x)}"
        cy="${formatNumber(center.y)}"
        rx="${formatNumber(radius)}"
        ry="${formatNumber(radius * flatten)}"
        fill="${fill}"
        transform="rotate(${formatNumber(rotation)} ${formatNumber(center.x)} ${formatNumber(center.y)})"
      />
    `);
  }

  return wrapLayer(items, clipId, layer, cx, cy);
}

function buildSpots(random, context) {
  const { cx, cy, rx, ry, clipId, palette, layer } = context;
  const spotSettings = layer.motifSettings ?? SPOT_MOTIF_SETTINGS;
  const planetRadius = Math.min(rx, ry);
  const count = clamp(
    Math.round(randomIntBetweenSetting(random, spotSettings.countRange) * layer.density),
    spotSettings.countRange[0],
    spotSettings.countRange[1],
  );
  const baseColor = mixColors(
    palette.base,
    palette.dark,
    randomBetweenSetting(random, spotSettings.colorMixRange),
  );
  const items = [];

  for (let index = 0; index < count; index++) {
    const center = randomPointInEllipse(random, cx, cy, rx * 0.82, ry * 0.82);
    const radius = planetRadius * randomBetweenSetting(random, spotSettings.radiusRatioRange);
    const flatten = randomBetweenSetting(random, spotSettings.flattenRatioRange);
    const rotation = randomBetween(random, -70, 70);
    const fill = shiftColorTone(
      baseColor,
      randomBetween(random, -8, 8),
      randomBetween(random, -0.04, 0.04),
      randomBetween(random, -0.04, 0.04),
    );

    items.push(`
      <ellipse
        cx="${formatNumber(center.x)}"
        cy="${formatNumber(center.y)}"
        rx="${formatNumber(radius)}"
        ry="${formatNumber(radius * flatten)}"
        fill="${fill}"
        transform="rotate(${formatNumber(rotation)} ${formatNumber(center.x)} ${formatNumber(center.y)})"
      />
    `);
  }

  return wrapLayer(items, clipId, layer, cx, cy);
}

function buildPatches(random, context) {
  const { cx, cy, rx, ry, clipId, palette, layer } = context;
  const patchSettings = layer.motifSettings ?? PATCH_MOTIF_SETTINGS;
  const sectorCount = 6;
  const baseAngle = randomBetween(random, 0, 360);
  const largeSectorCount = sectorCount / 2;
  const smallSectorCount = sectorCount / 2;
  const largeTotalAngle = randomBetween(
    random,
    patchSettings.largeSectorTotalAngleRange[0],
    patchSettings.largeSectorTotalAngleRange[1],
  );
  const smallTotalAngle = 360 - largeTotalAngle;
  const largeWeights = Array.from({ length: largeSectorCount }, () => randomBetween(random, 0.82, 1.18));
  const smallWeights = Array.from({ length: smallSectorCount }, () => randomBetween(random, 0.72, 1.28));
  const largeWeightTotal = largeWeights.reduce((sum, value) => sum + value, 0);
  const smallWeightTotal = smallWeights.reduce((sum, value) => sum + value, 0);
  const hueShift = random() < 0.5
    ? -randomBetween(random, 9, 16)
    : randomBetween(random, 9, 16);
  const saturationShift = random() < 0.5
    ? -randomBetween(random, 0.08, 0.18)
    : randomBetween(random, 0.08, 0.18);
  const fill = shiftColorTone(
    palette.base,
    hueShift,
    saturationShift,
    randomBetween(random, -0.03, 0.03),
  );
  const items = [];
  let currentAngle = baseAngle;

  for (let i = 0; i < sectorCount; i++) {
    const isLargeSector = i % 2 === 0;
    const sectorIndex = Math.floor(i / 2);
    const sectorAngle = isLargeSector
      ? (largeWeights[sectorIndex] / largeWeightTotal) * largeTotalAngle
      : (smallWeights[sectorIndex] / smallWeightTotal) * smallTotalAngle;
    const nextAngle = currentAngle + sectorAngle;

    if (isLargeSector) {
      items.push(`
        <path
          d="${createPatchSectorPath(random, cx, cy, rx, ry, currentAngle, nextAngle, patchSettings)}"
          fill="${fill}"
          opacity="${formatNumber(randomBetween(random, 0.9, 0.98))}"
        />
      `);
    }

    currentAngle = nextAngle;
  }

  return wrapLayer(items, clipId, layer, cx, cy);
}

function buildCraters(random, context) {
  const { cx, cy, rx, ry, clipId, palette, layer } = context;
  const craterSettings = layer.motifSettings ?? CRATER_MOTIF_SETTINGS;
  const targetCount = clamp(
    Math.round(randomIntBetweenSetting(random, craterSettings.countRange) * layer.density),
    craterSettings.countRange[0],
    craterSettings.countRange[1],
  );
  const defs = [];
  const items = [];
  const placedCraters = [];
  const craterColor = palette.dark;
  const craterMidColor = mixColors(palette.dark, palette.base, 0.5);
  const planetRadius = Math.min(rx, ry);
  const innerRingRadius = planetRadius * craterSettings.innerRingRadiusRatio;
  const maxAttempts = targetCount * 30;
  let attempts = 0;

  while (placedCraters.length < targetCount && attempts < maxAttempts) {
    attempts += 1;
    const craterRx = randomBetweenSetting(random, craterSettings.radiusRange);
    const craterRy = craterRx * randomBetweenSetting(random, craterSettings.flattenRatioRange);
    const maxCenterRadius = Math.max(
      innerRingRadius,
      planetRadius - craterRx - craterSettings.centerPadding,
    );
    const angle = randomBetween(random, 0, Math.PI * 2);
    const radialDistance = Math.sqrt(
      randomBetween(random, innerRingRadius * innerRingRadius, maxCenterRadius * maxCenterRadius),
    );
    const x = cx + Math.cos(angle) * radialDistance;
    const y = cy + Math.sin(angle) * radialDistance;
    const radialAngle = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    const rotation = radialAngle + 90;
    const midShift = randomBetweenSetting(random, craterSettings.midShiftRange);
    const craterClipId = `craterClip-${layer.seed}-${placedCraters.length}`;
    const candidate = { x, y, rx: craterRx };

    if (craterCollides(candidate, placedCraters, craterSettings.collisionGap)) {
      continue;
    }

    placedCraters.push(candidate);

    defs.push(`
      <clipPath id="${craterClipId}">
        <ellipse
          cx="${formatNumber(x)}"
          cy="${formatNumber(y)}"
          rx="${formatNumber(craterRx)}"
          ry="${formatNumber(craterRy)}"
        />
      </clipPath>
    `);

    items.push(`
      <g transform="rotate(${formatNumber(rotation)} ${formatNumber(x)} ${formatNumber(y)})">
        <ellipse
          cx="${formatNumber(x)}"
          cy="${formatNumber(y)}"
          rx="${formatNumber(craterRx)}"
          ry="${formatNumber(craterRy)}"
          fill="${craterColor}"
        />
        <ellipse
          cx="${formatNumber(x)}"
          cy="${formatNumber(y + midShift)}"
          rx="${formatNumber(craterRx)}"
          ry="${formatNumber(craterRy)}"
          fill="${craterMidColor}"
          clip-path="url(#${craterClipId})"
        />
      </g>
    `);
  }

  return `<g clip-path="url(#${clipId})"><defs>${defs.join("")}</defs>${items.join("")}</g>`;
}

function buildVeins(random, context) {
  const { cx, cy, rx, ry, clipId, palette, layer } = context;
  const veinSettings = layer.motifSettings ?? VEIN_MOTIF_SETTINGS;
  const planetRadius = Math.min(rx, ry);
  const count = clamp(
    Math.round(randomIntBetweenSetting(random, veinSettings.countRange) * layer.density),
    veinSettings.countRange[0],
    veinSettings.countRange[1],
  );
  const diameterAngle = randomBetween(random, 0, Math.PI * 2);
  const diameterDirection = {
    x: Math.cos(diameterAngle),
    y: Math.sin(diameterAngle),
  };
  const chordDirection = {
    x: -diameterDirection.y,
    y: diameterDirection.x,
  };
  const pointPositionJitter = randomBetweenSetting(random, veinSettings.pointPositionJitterRange);
  const fractions = createJitteredFractions(random, count, pointPositionJitter);
  const items = [];
  const veinColor = mixColors(palette.base, palette.dark, randomBetweenSetting(random, veinSettings.colorMixRange));

  for (const fraction of fractions) {
    const offsetFromCenter = (fraction * 2 - 1) * planetRadius;
    const center = {
      x: cx + diameterDirection.x * offsetFromCenter,
      y: cy + diameterDirection.y * offsetFromCenter,
    };
    const rotationDeg = randomBetweenSetting(random, veinSettings.directionRotationRange)
      * (random() < 0.5 ? -1 : 1);
    const rotationRad = (rotationDeg * Math.PI) / 180;
    const direction = {
      x: chordDirection.x * Math.cos(rotationRad) - chordDirection.y * Math.sin(rotationRad),
      y: chordDirection.x * Math.sin(rotationRad) + chordDirection.y * Math.cos(rotationRad),
    };
    const normal = {
      x: -direction.y,
      y: direction.x,
    };
    const relativeCenter = {
      x: center.x - cx,
      y: center.y - cy,
    };
    const projectedDistance = relativeCenter.x * direction.x + relativeCenter.y * direction.y;
    const centerDistanceSquared = relativeCenter.x * relativeCenter.x + relativeCenter.y * relativeCenter.y;
    const halfChordLength = Math.sqrt(
      Math.max(0, projectedDistance * projectedDistance + planetRadius * planetRadius - centerDistanceSquared),
    );
    const extendedHalfLength = halfChordLength * veinSettings.lengthMultiplier;
    const start = {
      x: center.x - direction.x * extendedHalfLength,
      y: center.y - direction.y * extendedHalfLength,
    };
    const end = {
      x: center.x + direction.x * extendedHalfLength,
      y: center.y + direction.y * extendedHalfLength,
    };
    const bendRatio = randomBetweenSetting(random, veinSettings.bendRatioRange) * (random() < 0.5 ? -1 : 1);
    const control = {
      x: center.x + normal.x * halfChordLength * bendRatio,
      y: center.y + normal.y * halfChordLength * bendRatio,
    };
    const veinWidth = randomBetween(
      random,
      veinSettings.widthRange[0],
      veinSettings.widthRange[1],
    );

    items.push(`
      <path
        d="M ${formatNumber(start.x)} ${formatNumber(start.y)} Q ${formatNumber(control.x)} ${formatNumber(control.y)} ${formatNumber(end.x)} ${formatNumber(end.y)}"
        fill="none"
        stroke="${veinColor}"
        stroke-width="${formatNumber(veinWidth)}"
        stroke-linecap="round"
      />
    `);
  }

  return wrapLayer(items, clipId, layer, cx, cy);
}

// Host apps can use the metadata for filtering or UI while keeping the SVG ready to mount.
function createPlanetModel(options = {}) {
  const seed = options.seed ?? nextSeed();
  const settings = {
    ...SETTINGS,
    ...(options.settings ?? {}),
  };
  const random = mulberry32(hashString(String(seed)));
  const archetype = resolveArchetype(random, options.archetype);
  const palette = pick(random, archetype.palettes);
  const flatten = 1;
  const geometry = buildPlanetGeometry(settings);
  const profile = buildPlanetProfile(random, seed, archetype, palette, settings, geometry, flatten);
  const instanceId = options.instanceId ?? createInstanceId(seed);
  const label = `Planete ${profile.label.toLowerCase()} en flat design`;
  const svg = makeSvgTag(buildPlanetMarkup(instanceId, geometry, profile), geometry.size, label);

  return {
    seed,
    instanceId,
    svg,
    geometry,
    profile,
  };
}

function createPlanetSvg(options = {}) {
  return createPlanetModel(options);
}

export {
  SETTINGS,
  PLANET_ARCHETYPES,
  createPlanetModel,
  createPlanetSvg,
  nextSeed,
};
