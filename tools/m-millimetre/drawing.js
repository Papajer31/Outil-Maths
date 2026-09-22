/*
  Réglages graphiques de M. Millimètre.

  Le point de réglage principal est pxPerMm : il définit l'échelle commune aux
  modes Lire et Construire. Toutes les longueurs sont ensuite strictement
  proportionnelles : 100 mm = 100 * pxPerMm, 10 mm = 10 * pxPerMm, etc.

  Cet objet n'est volontairement pas gelé afin de rester très facile à régler
  pendant les essais sur les écrans et tablettes de la classe.
*/
export const MILLIMETRE_DRAWING = {
  pxPerMm: 4,

  // Reconnaissance hors loupe, exprimée relativement à la centaine (100 %).
  hundredMinRatio: 0.80,
  hundredMaxRatio: 1.20,
  tenMinRatio: 0.05,
  tenMaxRatio: 0.20,

  // Le tout premier segment est plus difficile à estimer car l'élève n'a
  // encore aucun repère visuel. Seule la zone de reconnaissance de la centaine
  // est donc élargie pour ce premier morceau.
  firstHundredMinRatio: 0.65,
  firstHundredMaxRatio: 1.35,

  // Loupe des unités en mode Construire. Le disque représente un rayon réel de
  // 12 mm autour du dernier point, puis l'agrandit sans modifier l'échelle du
  // dessin principal. 1 mm dans la loupe = pxPerMm * magnifierScale pixels.
  magnifierScale: 4,
  magnifierRadiusMm: 12,
  maxUnitsPerMagnifierStroke: 9,

  // Loupe de lecture : cercle déplaçable qui agrandit la ligne sous lui.
  readLensZoom: 2.6,
  readLensDiameterPx: 190,

  lineWidthPx: 1.8,
  provisionalLineWidthPx: 2.4,
  // Une seule graduation par millimètre, toujours du même côté du segment.
  tickLengthPx: 2.5,
  startHitRadiusPx: 28,
  canvasPaddingPx: 28,
  minimumCanvasHeightPx: 390,
  // Génération du mode Lire. Les angles restent proches du patron de base,
  // mais une petite variation évite d'obtenir toujours la même silhouette.
  // Toutes les centaines utilisent exactement la même fourchette d'angle.
  generatedHundredAngleDeg: 82,
  generatedHundredAngleJitterDeg: 5,

  // Au-delà de 9 centaines, les groupes de 10 segments sont disposés sur
  // un même arc volontairement OUVERT. Pour les très longues constructions,
  // le moteur réduit d'abord la courbure ENTRE blocs et ne compacte le zigzag
  // interne que dans une limite qui garde chaque bloc lisible.
  generatedHundredCompactMaxAngleDeg: 86.5,
  generatedHundredFitStepDeg: 0.5,
  generatedHundredBlockArcStepDeg: 7,
  generatedHundredBlockArcStepMinDeg: 1.5,
  generatedHundredBlockArcFitStepDeg: 1,
  generatedHundredCompactJitterDeg: 1,

  // À partir de 20 centaines, la génération utilise un zigzag compact mais
  // régulier. La projection sur l'axe du tracé est exprimée en pixels : deux
  // traits successifs doivent rester distincts, même quand près de 100
  // centaines doivent tenir dans la zone blanche.
  generatedLongThresholdHundreds: 20,
  generatedLongPreferredAdvancePx: 18,
  generatedLongMinimumAdvancePx: 9.5,
  // Ce minimum de secours n'est utilisé que si plusieurs variantes restent
  // trop larges avec l'espacement normal. Il garantit l'absence de défilement
  // horizontal, y compris pour 9 999 sur la largeur minimale de lecture.
  generatedLongEmergencyMinimumAdvancePx: 1,
  generatedLongAdvanceFitStepPx: 0.5,
  generatedLongAdvanceJitterPx: 1,
  generatedLongFitAttempts: 3,

  // Patron d'un paquet complet de 10 centaines, relevé sur le tracé manuel.
  // Les cinq barres descendantes sont de moins en moins inclinées. Chaque
  // retour remonte vers la gauche : les sommets du côté ouvert avancent de
  // 45 px, ceux du côté resserré de 35 px. Ce sont ces deux pas alternés qui
  // donnent au paquet sa silhouette en W/éventail.
  generatedLongFanFirstAdvancePx: 105,
  generatedLongFanLargeJointPx: 50,
  generatedLongFanSmallJointPx: 35,

  // Le paquet final incomplet (1 à 9 centaines) quitte franchement l'axe du
  // dernier paquet de 10. Ce décrochage ne s'applique qu'au raccord qui le
  // précède : ses propres barres conservent ensuite leur zigzag simple.
  generatedLongRemainderSeparationDeg: 28,

  // L'axe tourne très progressivement d'un paquet à l'autre. Cette petite
  // courbure reproduit la dérive naturelle du tracé manuel ; elle est réduite
  // automatiquement si la hauteur disponible l'exige.
  generatedLongBlockArcStepDeg: 1.1,
  generatedLongBlockArcStepMinDeg: 0.2,
  generatedLongBlockArcFitStepDeg: 0.1,

  generatedTensAngleDeg: 34,
  generatedTensAngleJitterDeg: 7,
  // Sur un très grand nombre, les dizaines peuvent devenir presque verticales
  // avant de compacter davantage les centaines.
  generatedLongTensCompactAngleDeg: 82,
  generatedLongTensAngleFitStepDeg: 8,

  // Le segment final des unités ne doit jamais prolonger presque tout droit
  // le segment précédent. 20° de changement de cap correspondent à un angle
  // géométrique maximal de 160° au sommet (180° = continuité parfaite).
  generatedUnitsTurnMinDeg: 24,
  generatedUnitsTurnMaxDeg: 72,

  // Petite rotation globale du tracé, appliquée seulement si la figure entière
  // reste dans la zone blanche avec son padding de sécurité.
  generatedFinalRotationMaxDeg: 8,

  // Placement aléatoire modéré dans la zone disponible. 0 = toujours calé
  // au même endroit ; 1 = exploite tout l'espace libre.
  generatedPlacementJitterRatio: 0.55
};

export function mmToPx(mm) {
  return Number(mm) * Number(MILLIMETRE_DRAWING.pxPerMm);
}

export function recognizeNormalSegmentLengthMm(distancePx, { firstSegment = false } = {}) {
  const hundredPx = mmToPx(100);
  if (!(hundredPx > 0) || !Number.isFinite(Number(distancePx))) return null;

  const ratio = Number(distancePx) / hundredPx;
  const hundredMin = firstSegment
    ? Number(MILLIMETRE_DRAWING.firstHundredMinRatio)
    : Number(MILLIMETRE_DRAWING.hundredMinRatio);
  const hundredMax = firstSegment
    ? Number(MILLIMETRE_DRAWING.firstHundredMaxRatio)
    : Number(MILLIMETRE_DRAWING.hundredMaxRatio);

  if (ratio >= hundredMin && ratio <= hundredMax) {
    return 100;
  }
  if (ratio >= MILLIMETRE_DRAWING.tenMinRatio && ratio <= MILLIMETRE_DRAWING.tenMaxRatio) {
    return 10;
  }
  return null;
}

export function snapEndpoint(start, pointer, lengthMm) {
  const dx = Number(pointer?.x) - Number(start?.x);
  const dy = Number(pointer?.y) - Number(start?.y);
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0)) return { x: Number(start?.x) || 0, y: Number(start?.y) || 0, angle: 0 };

  const lengthPx = mmToPx(lengthMm);
  const ux = dx / distance;
  const uy = dy / distance;
  return {
    x: Number(start.x) + ux * lengthPx,
    y: Number(start.y) + uy * lengthPx,
    angle: Math.atan2(uy, ux)
  };
}

export function createSegment(start, pointer, lengthMm, extra = {}) {
  const snapped = snapEndpoint(start, pointer, lengthMm);
  return {
    mm: Number(lengthMm),
    start: { x: Number(start.x), y: Number(start.y) },
    end: { x: snapped.x, y: snapped.y },
    angle: snapped.angle,
    ...extra
  };
}

export function buildGraduationPath(segment, { scale = 1, visibleMm = null } = {}) {
  const mm = Math.max(0, Math.floor(Number(visibleMm ?? segment?.mm) || 0));
  if (!segment || mm <= 0) return "";

  const start = segment.start;
  const end = segment.end;
  const dx = Number(end.x) - Number(start.x);
  const dy = Number(end.y) - Number(start.y);
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return "";

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const pxPerMm = mmToPx(1) * Number(scale || 1);
  const pieces = [];

  for (let index = 0; index <= mm; index += 1) {
    const distance = Math.min(length, index * pxPerMm);
    const cx = Number(start.x) + ux * distance;
    const cy = Number(start.y) + uy * distance;
    const tickLength = Number(MILLIMETRE_DRAWING.tickLengthPx) || 5;
    pieces.push(
      `M ${fmt(cx)} ${fmt(cy)} L ${fmt(cx + nx * tickLength)} ${fmt(cy + ny * tickLength)}`
    );
  }

  return pieces.join(" ");
}

export function buildGeneratedSegments(decomposition, { width = 1200, height = 460, randomSeed = null } = {}) {
  const hundreds = Math.max(0, Math.floor(Number(decomposition?.hundreds) || 0));
  const tens = Math.max(0, Math.floor(Number(decomposition?.tens) || 0));
  const units = Math.max(0, Math.min(9, Math.floor(Number(decomposition?.units) || 0)));
  const pad = MILLIMETRE_DRAWING.canvasPaddingPx;
  const useRandom = randomSeed !== null && randomSeed !== undefined;

  // Pour les constructions longues, on cherche D'ABORD une géométrie qui tient
  // entièrement dans la zone blanche, sans jamais toucher à l'échelle px/mm.
  // On conserve autant que possible la séparation angulaire entre blocs de dix
  // et on resserre progressivement le zigzag à l'intérieur de chaque bloc.
  const rawSegments = buildBestFittingRawSegments(
    { hundreds, tens, units },
    { width, height, randomSeed: useRandom ? randomSeed : 0, useRandom }
  );

  // Une petite rotation globale reste possible, mais seulement après avoir
  // obtenu une construction qui tient déjà dans le viewport. La rotation est
  // elle-même réduite automatiquement si elle risquait de rogner le tracé.
  const rotationRandom = createSeededRandom(`${randomSeed ?? 0}:rotation`);
  const rotatedSegments = useRandom
    ? rotateGeneratedSegmentsToFit(rawSegments, { width, height, padding: pad, random: rotationRandom })
    : rawSegments;

  const rawBounds = getSegmentsBounds(rotatedSegments);
  const placementRandom = useRandom ? createSeededRandom(`${randomSeed}:placement`) : null;
  const translated = translateGeneratedSegmentsIntoViewport(rotatedSegments, rawBounds, {
    width,
    height,
    padding: pad,
    random: placementRandom
  });
  const visualSafety = Math.max(6, Number(MILLIMETRE_DRAWING.tickLengthPx) + 3);
  const bounds = getSegmentsBounds(translated.segments, { padding: visualSafety });
  const requiredWidth = Math.max(width, bounds.x + bounds.width);
  const requiredHeight = Math.max(height, bounds.y + bounds.height);

  return {
    segments: translated.segments,
    start: translated.segments[0]?.start || { x: pad, y: pad },
    end: translated.end,
    bounds,
    requiredWidth,
    requiredHeight
  };
}

function buildBestFittingRawSegments(decomposition, { width, height, randomSeed, useRandom }) {
  const hundreds = Math.max(0, Math.floor(Number(decomposition?.hundreds) || 0));

  if (hundreds >= Number(MILLIMETRE_DRAWING.generatedLongThresholdHundreds || 20)) {
    return buildBestFittingLongRawSegments(decomposition, { width, height, randomSeed, useRandom });
  }

  const blockCount = Math.ceil(hundreds / 10);
  const baseAngle = Number(MILLIMETRE_DRAWING.generatedHundredAngleDeg) || 82;
  const maxAngle = Math.max(baseAngle, Number(MILLIMETRE_DRAWING.generatedHundredCompactMaxAngleDeg) || 89);
  const angleStep = Math.max(0.1, Number(MILLIMETRE_DRAWING.generatedHundredFitStepDeg) || 0.5);
  const configuredArcStep = blockCount > 1
    ? Math.max(0, Number(MILLIMETRE_DRAWING.generatedHundredBlockArcStepDeg) || 0)
    : 0;
  // Plus il y a de blocs, plus l'arc global doit rester ouvert. On réduit donc
  // progressivement la rotation ENTRE blocs au lieu de refermer l'ensemble en
  // éventail. Pour 3 blocs et plus, la priorité est la lisibilité des groupes.
  const blockArcFactor = blockCount >= 4 ? 0.72 : (blockCount === 3 ? 0.86 : 1);
  const preferredArcStep = configuredArcStep * blockArcFactor;
  const configuredMinArcStep = blockCount > 1
    ? Math.max(0, Number(MILLIMETRE_DRAWING.generatedHundredBlockArcStepMinDeg) || 0)
    : 0;
  const minimumArcStep = blockCount > 1
    ? Math.max(0, Math.min(preferredArcStep, configuredMinArcStep * blockArcFactor))
    : 0;
  const arcFitStep = Math.max(0.5, Number(MILLIMETRE_DRAWING.generatedHundredBlockArcFitStepDeg) || 2);

  const safety = Math.max(6, Number(MILLIMETRE_DRAWING.tickLengthPx) + 3);
  const maxWidth = Math.max(1, Number(width) - safety * 2);
  const maxHeight = Math.max(1, Number(height) - safety * 2);

  const arcSteps = [];
  if (preferredArcStep <= 0) {
    arcSteps.push(0);
  } else {
    for (let step = preferredArcStep; step >= minimumArcStep - 0.001; step -= arcFitStep) {
      arcSteps.push(Math.max(minimumArcStep, step));
    }
    if (!arcSteps.some((value) => Math.abs(value - minimumArcStep) < 0.001)) {
      arcSteps.push(minimumArcStep);
    }
  }

  let best = null;

  // Priorité : conserver un arc lisible ENTRE les blocs. Pour une valeur de
  // pas d'arc donnée, on resserre autant que nécessaire le zigzag À
  // L'INTÉRIEUR des blocs jusqu'à faire tenir la figure entière.
  for (const blockArcStepDeg of arcSteps) {
    for (let hundredAngleDeg = baseAngle; hundredAngleDeg <= maxAngle + 0.001; hundredAngleDeg += angleStep) {
      const segments = buildRawGeneratedSegments(decomposition, {
        hundredAngleDeg,
        blockArcStepDeg,
        randomSeed,
        useRandom
      });
      const bounds = getSegmentsBounds(segments);
      const overflowX = Math.max(0, bounds.width - maxWidth);
      const overflowY = Math.max(0, bounds.height - maxHeight);
      const overflow = overflowX + overflowY;
      const candidate = { segments, overflow, blockArcStepDeg, hundredAngleDeg };

      if (!best || overflow < best.overflow - 0.001 || (
        Math.abs(overflow - best.overflow) < 0.001 && blockArcStepDeg > best.blockArcStepDeg
      )) {
        best = candidate;
      }

      if (overflow <= 0.001) return segments;
    }
  }

  return best?.segments || buildRawGeneratedSegments(decomposition, {
    hundredAngleDeg: maxAngle,
    blockArcStepDeg: minimumArcStep,
    randomSeed,
    useRandom
  });
}

function buildBestFittingLongRawSegments(decomposition, { width, height, randomSeed, useRandom }) {
  const preferredArcStep = Math.max(0, Number(MILLIMETRE_DRAWING.generatedLongBlockArcStepDeg) || 1.1);
  const minimumArcStep = Math.max(0, Math.min(
    preferredArcStep,
    Number(MILLIMETRE_DRAWING.generatedLongBlockArcStepMinDeg) || 0.2
  ));
  const arcFitStep = Math.max(0.05, Number(MILLIMETRE_DRAWING.generatedLongBlockArcFitStepDeg) || 0.1);
  const preferredAdvance = Math.max(1, Number(MILLIMETRE_DRAWING.generatedLongPreferredAdvancePx) || 18);
  const minimumAdvance = Math.max(1, Math.min(
    preferredAdvance,
    Number(MILLIMETRE_DRAWING.generatedLongMinimumAdvancePx) || 9.5
  ));
  const emergencyMinimumAdvance = Math.max(0.25, Math.min(
    minimumAdvance,
    Number(MILLIMETRE_DRAWING.generatedLongEmergencyMinimumAdvancePx) || 1
  ));
  const advanceFitStep = Math.max(0.25, Number(MILLIMETRE_DRAWING.generatedLongAdvanceFitStepPx) || 0.5);
  const baseTensAngle = clampNumber(MILLIMETRE_DRAWING.generatedTensAngleDeg, 1, 89);
  const compactTensAngle = Math.max(
    baseTensAngle,
    clampNumber(MILLIMETRE_DRAWING.generatedLongTensCompactAngleDeg, baseTensAngle, 89)
  );
  const tensAngleFitStep = Math.max(1, Number(MILLIMETRE_DRAWING.generatedLongTensAngleFitStepDeg) || 8);
  const fitAttempts = useRandom
    ? Math.max(1, Math.floor(Number(MILLIMETRE_DRAWING.generatedLongFitAttempts) || 3))
    : 1;

  const safety = Math.max(6, Number(MILLIMETRE_DRAWING.tickLengthPx) + 3);
  const maxWidth = Math.max(1, Number(width) - safety * 2);
  const maxHeight = Math.max(1, Number(height) - safety * 2);
  let best = null;

  // On essaie d'abord plusieurs silhouettes du même nombre sans dégrader la
  // lisibilité minimale configurée. Les dizaines se redressent avant que les
  // paquets de centaines soient davantage resserrés.
  for (let attempt = 0; attempt < fitAttempts; attempt += 1) {
    const attemptSeed = attempt === 0 ? randomSeed : `${randomSeed}:retry:${attempt}`;
    const result = searchLongGeneratedFit(decomposition, {
      preferredArcStep,
      minimumArcStep,
      arcFitStep,
      maximumAdvance: preferredAdvance,
      minimumAdvance,
      advanceFitStep,
      baseTensAngle,
      compactTensAngle,
      tensAngleFitStep,
      maxWidth,
      maxHeight,
      randomSeed: attemptSeed,
      useRandom
    });
    best = pickBetterLongFit(best, result);
    if (result?.overflowX <= 0.001) return result.segments;
  }

  // Si aucune variante lisible ne tient encore, on poursuit la compaction
  // jusqu'au minimum de secours. Cette passe a priorité absolue sur la largeur :
  // la hauteur du SVG peut grandir, mais sa largeur ne doit jamais dépasser.
  if (emergencyMinimumAdvance < minimumAdvance - 0.001) {
    for (let attempt = 0; attempt < fitAttempts; attempt += 1) {
      const attemptSeed = attempt === 0 ? randomSeed : `${randomSeed}:retry:${attempt}`;
      const result = searchLongGeneratedFit(decomposition, {
        preferredArcStep,
        minimumArcStep,
        arcFitStep,
        maximumAdvance: Math.max(emergencyMinimumAdvance, minimumAdvance - advanceFitStep),
        minimumAdvance: emergencyMinimumAdvance,
        advanceFitStep,
        baseTensAngle: compactTensAngle,
        compactTensAngle,
        tensAngleFitStep,
        maxWidth,
        maxHeight,
        randomSeed: attemptSeed,
        useRandom
      });
      best = pickBetterLongFit(best, result);
      if (result?.overflowX <= 0.001) return result.segments;
    }
  }

  return best?.segments || buildLongRawGeneratedSegments(decomposition, {
    blockArcStepDeg: minimumArcStep,
    internalAdvancePx: emergencyMinimumAdvance,
    tensAngleDeg: compactTensAngle,
    tensAngleJitterDeg: 0,
    randomSeed,
    useRandom
  });
}

function searchLongGeneratedFit(decomposition, {
  preferredArcStep,
  minimumArcStep,
  arcFitStep,
  maximumAdvance,
  minimumAdvance,
  advanceFitStep,
  baseTensAngle,
  compactTensAngle,
  tensAngleFitStep,
  maxWidth,
  maxHeight,
  randomSeed,
  useRandom
}) {
  const tensAngles = steppedValues(baseTensAngle, compactTensAngle, tensAngleFitStep);
  let best = null;

  for (let arcStep = preferredArcStep; arcStep >= minimumArcStep - 0.001; arcStep -= arcFitStep) {
    const safeArcStep = Math.max(minimumArcStep, arcStep);
    for (let advance = maximumAdvance; advance >= minimumAdvance - 0.001; advance -= advanceFitStep) {
      const safeAdvance = Math.max(minimumAdvance, advance);
      for (const tensAngleDeg of tensAngles) {
        const compactionRatio = compactTensAngle > baseTensAngle
          ? (tensAngleDeg - baseTensAngle) / (compactTensAngle - baseTensAngle)
          : 0;
        const tensAngleJitterDeg = Number(MILLIMETRE_DRAWING.generatedTensAngleJitterDeg) * (1 - compactionRatio * 0.85);
        const segments = buildLongRawGeneratedSegments(decomposition, {
          blockArcStepDeg: safeArcStep,
          internalAdvancePx: safeAdvance,
          tensAngleDeg,
          tensAngleJitterDeg,
          randomSeed,
          useRandom
        });
        const bounds = getSegmentsBounds(segments);
        const candidate = {
          segments,
          overflowX: Math.max(0, bounds.width - maxWidth),
          overflowY: Math.max(0, bounds.height - maxHeight),
          arcStep: safeArcStep,
          advance: safeAdvance,
          tensAngleDeg
        };
        best = pickBetterLongFit(best, candidate);
        if (candidate.overflowX <= 0.001) return candidate;
      }
    }
  }

  return best;
}

function pickBetterLongFit(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  if (candidate.overflowX < current.overflowX - 0.001) return candidate;
  if (candidate.overflowX > current.overflowX + 0.001) return current;
  if (candidate.overflowY < current.overflowY - 0.001) return candidate;
  if (candidate.overflowY > current.overflowY + 0.001) return current;
  if (candidate.arcStep > current.arcStep + 0.001) return candidate;
  if (candidate.arcStep < current.arcStep - 0.001) return current;
  if (candidate.advance > current.advance + 0.001) return candidate;
  if (candidate.advance < current.advance - 0.001) return current;
  return candidate.tensAngleDeg < current.tensAngleDeg ? candidate : current;
}

function steppedValues(start, end, step) {
  const values = [];
  for (let value = start; value <= end + 0.001; value += step) {
    values.push(Math.min(end, value));
  }
  if (!values.some((value) => Math.abs(value - end) < 0.001)) values.push(end);
  return values;
}

function buildLongRawGeneratedSegments(decomposition, {
  blockArcStepDeg,
  internalAdvancePx,
  tensAngleDeg = MILLIMETRE_DRAWING.generatedTensAngleDeg,
  tensAngleJitterDeg = MILLIMETRE_DRAWING.generatedTensAngleJitterDeg,
  randomSeed,
  useRandom
}) {
  const hundreds = Math.max(0, Math.floor(Number(decomposition?.hundreds) || 0));
  const tens = Math.max(0, Math.floor(Number(decomposition?.tens) || 0));
  const units = Math.max(0, Math.min(9, Math.floor(Number(decomposition?.units) || 0)));
  const hundredLength = mmToPx(100);
  const tenLength = mmToPx(10);
  const random = createSeededRandom(`${randomSeed ?? 0}:long-shape`);

  const fullBlocks = Math.floor(hundreds / 10);
  const remainder = hundreds % 10;
  const blockCount = fullBlocks + (remainder > 0 ? 1 : 0);
  const startSideSign = useRandom && random() < 0.5 ? -1 : 1;
  const arcDirection = useRandom && random() < 0.5 ? -1 : 1;
  const internalAdvance = clampNumber(internalAdvancePx, 1, hundredLength - 1);
  const advanceJitter = useRandom
    ? Math.max(0, Number(MILLIMETRE_DRAWING.generatedLongAdvanceJitterPx) || 0)
    : 0;
  const preferredAdvance = Math.max(1, Number(MILLIMETRE_DRAWING.generatedLongPreferredAdvancePx) || 18);
  const fanScale = internalAdvance / preferredAdvance;
  const fanFirstAdvance = Math.max(1, Number(MILLIMETRE_DRAWING.generatedLongFanFirstAdvancePx) || 105) * fanScale;
  const fanLargeJoint = Math.max(1, Number(MILLIMETRE_DRAWING.generatedLongFanLargeJointPx) || 50) * fanScale;
  const fanSmallJoint = Math.max(0, Number(MILLIMETRE_DRAWING.generatedLongFanSmallJointPx) || 35) * fanScale;
  const fanAdvanceDrop = Math.max(0, fanLargeJoint - fanSmallJoint);

  let point = { x: 0, y: 0 };
  const segments = [];

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const isRemainderBlock = blockIndex >= fullBlocks && remainder > 0;
    const segmentCount = isRemainderBlock ? remainder : 10;
    if (segmentCount <= 0) continue;

    const remainderSeparationDeg = isRemainderBlock && fullBlocks > 0
      ? Math.max(0, Number(MILLIMETRE_DRAWING.generatedLongRemainderSeparationDeg) || 28)
      : 0;
    const axis = degreesToRadians(
      blockIndex * blockArcStepDeg * arcDirection
      - startSideSign * remainderSeparationDeg
    );
    const axisX = Math.cos(axis);
    const axisY = Math.sin(axis);
    const normalX = -axisY;
    const normalY = axisX;
    const pairAdvances = new Map();

    for (let indexInBlock = 0; indexInBlock < segmentCount; indexInBlock += 1) {
      const pairIndex = Math.floor(indexInBlock / 2);
      if (!pairAdvances.has(pairIndex)) {
        const jitter = advanceJitter > 0 ? randomBetween(random, -advanceJitter, advanceJitter) : 0;
        const baseAdvance = isRemainderBlock
          ? internalAdvance
          : fanFirstAdvance - pairIndex * fanAdvanceDrop;
        pairAdvances.set(pairIndex, baseAdvance + jitter);
      }
      const closesFullBlock = !isRemainderBlock && indexInBlock === 9;
      const pairAdvance = pairAdvances.get(pairIndex);
      let advance;

      // Dans un paquet complet, l'aller avance fortement vers la droite et le
      // retour remonte vers la gauche. Leur somme vaut le grand pas. L'aller
      // suivant a perdu (grand pas - petit pas) : la somme retour/aller vaut
      // alors le petit pas. Après la 10e barre, le paquet suivant repart avec
      // l'inclinaison initiale, ce qui crée un unique angle de séparation.
      if (isRemainderBlock) {
        advance = pairAdvance;
      } else {
        advance = indexInBlock % 2 === 0
          ? pairAdvance
          : fanLargeJoint - pairAdvance;
      }
      advance = clampNumber(advance, -hundredLength + 1, hundredLength - 1);
      const perpendicular = Math.sqrt(Math.max(0, hundredLength * hundredLength - advance * advance));
      const sideSign = (indexInBlock % 2 === 0 ? 1 : -1) * startSideSign;
      const target = {
        x: point.x + axisX * advance + normalX * perpendicular * sideSign,
        y: point.y + axisY * advance + normalY * perpendicular * sideSign
      };
      const segment = createSegment(point, target, 100, {
        kind: "hundred",
        hundredBlockIndex: blockIndex,
        hundredBlockRemainder: isRemainderBlock,
        hundredBlockBoundary: closesFullBlock,
        hundredFanPairIndex: isRemainderBlock ? null : pairIndex
      });
      segments.push(segment);
      point = segment.end;
    }
  }

  // Même fin de construction que pour les valeurs plus courtes : dizaines puis
  // un unique segment d'unités. Elle participe au calcul d'encombrement global.
  const tensDirection = Math.abs(point.y) > 1
    ? (point.y > 0 ? -1 : 1)
    : (hundreds > 0 ? startSideSign : (useRandom && random() < 0.5 ? -1 : 1));
  const tensPairAngles = new Map();
  for (let index = 0; index < tens; index += 1) {
    const pairIndex = Math.floor(index / 2);
    if (!tensPairAngles.has(pairIndex)) {
      const jitter = useRandom
        ? randomBetween(random, -tensAngleJitterDeg, tensAngleJitterDeg)
        : 0;
      tensPairAngles.set(pairIndex, tensAngleDeg + jitter);
    }
    const angle = degreesToRadians(tensPairAngles.get(pairIndex));
    const directionSign = (index % 2 === 0 ? 1 : -1) * tensDirection;
    const target = {
      x: point.x + Math.cos(angle) * tenLength,
      y: point.y + directionSign * Math.sin(angle) * tenLength
    };
    const segment = createSegment(point, target, 10, { kind: "ten" });
    segments.push(segment);
    point = segment.end;
  }

  if (units > 0) {
    const previous = segments[segments.length - 1] || null;
    const previousHeading = previous
      ? Math.atan2(previous.end.y - previous.start.y, previous.end.x - previous.start.x)
      : degreesToRadians(useRandom ? randomBetween(random, -40, 40) : 25);
    const turnAbsDeg = useRandom
      ? randomBetween(random, MILLIMETRE_DRAWING.generatedUnitsTurnMinDeg, MILLIMETRE_DRAWING.generatedUnitsTurnMaxDeg)
      : MILLIMETRE_DRAWING.generatedUnitsTurnMinDeg;
    const turnSign = useRandom && random() < 0.5 ? -1 : 1;
    const direction = previousHeading + degreesToRadians(turnAbsDeg * turnSign);
    const unitLength = mmToPx(units);
    const target = {
      x: point.x + Math.cos(direction) * unitLength,
      y: point.y + Math.sin(direction) * unitLength
    };
    segments.push(createSegment(point, target, units, { kind: "unit" }));
  }

  return segments;
}

function buildRawGeneratedSegments(decomposition, {
  hundredAngleDeg,
  blockArcStepDeg,
  randomSeed,
  useRandom
}) {
  const hundreds = Math.max(0, Math.floor(Number(decomposition?.hundreds) || 0));
  const tens = Math.max(0, Math.floor(Number(decomposition?.tens) || 0));
  const units = Math.max(0, Math.min(9, Math.floor(Number(decomposition?.units) || 0)));
  const hundredLength = mmToPx(100);
  const tenLength = mmToPx(10);
  const random = createSeededRandom(`${randomSeed ?? 0}:shape`);

  let point = { x: 0, y: 0 };
  const segments = [];
  const blockCount = Math.ceil(hundreds / 10);
  const hundredsDirection = useRandom && random() < 0.5 ? -1 : 1;

  // Les blocs suivent un seul arc monotone. Le sens de cet arc n'est pas tiré
  // indépendamment : il est lié au tout premier segment, afin que la courbure
  // globale parte dans le même sens visuel que le démarrage de M. Millimètre.
  // Si le premier segment descend, le premier bloc se décale lui aussi vers le
  // bas ; s'il monte, l'arc est réfléchi verticalement.
  const arcDirection = -hundredsDirection;
  const blockArcCenter = (blockCount - 1) / 2;
  const compactJitter = blockCount > 1
    ? Number(MILLIMETRE_DRAWING.generatedHundredCompactJitterDeg) || 0
    : Number(MILLIMETRE_DRAWING.generatedHundredAngleJitterDeg) || 0;
  const pairAngles = new Map();

  for (let index = 0; index < hundreds; index += 1) {
    const blockIndex = Math.floor(index / 10);
    const indexInBlock = index % 10;
    const pairIndex = Math.floor(indexInBlock / 2);
    const pairKey = `${blockIndex}:${pairIndex}`;
    if (!pairAngles.has(pairKey)) {
      const jitter = useRandom ? randomBetween(random, -compactJitter, compactJitter) : 0;
      pairAngles.set(pairKey, clampNumber(hundredAngleDeg + jitter, 65, 89.5));
    }

    const axisDeg = blockCount > 1
      ? (blockIndex - blockArcCenter) * blockArcStepDeg * arcDirection
      : 0;
    const innerAngleDeg = pairAngles.get(pairKey);

    // Tous les blocs gardent la même phase : avec 10 segments (nombre pair),
    // chacun revient naturellement sur le même côté de son axe de base. Les
    // blocs peuvent ainsi suivre un arc continu sans alterner au-dessus et en
    // dessous. Leur séparation vient de l'écart d'axe entre deux blocs, qui est
    // volontairement bien plus grand que le petit jitter interne.
    const alternatingSign = (indexInBlock % 2 === 0 ? 1 : -1) * hundredsDirection;
    const headingDeg = axisDeg + alternatingSign * innerAngleDeg;
    const heading = degreesToRadians(headingDeg);
    const target = {
      x: point.x + Math.cos(heading) * hundredLength,
      y: point.y + Math.sin(heading) * hundredLength
    };
    const segment = createSegment(point, target, 100, {
      kind: "hundred",
      hundredBlockIndex: blockIndex
    });
    segments.push(segment);
    point = segment.end;
  }

  // Les dizaines gardent leur motif compact habituel. Elles restent intégrées
  // dans la recherche d'encombrement, de sorte que les centaines se resserrent
  // suffisamment pour leur laisser la place elles aussi.
  const tensDirection = Math.abs(point.y) > 1
    ? (point.y > 0 ? -1 : 1)
    : (hundreds > 0 ? hundredsDirection : (useRandom && random() < 0.5 ? -1 : 1));
  const tensPairAngles = new Map();
  for (let index = 0; index < tens; index += 1) {
    const pairIndex = Math.floor(index / 2);
    if (!tensPairAngles.has(pairIndex)) {
      const jitter = useRandom
        ? randomBetween(random, -MILLIMETRE_DRAWING.generatedTensAngleJitterDeg, MILLIMETRE_DRAWING.generatedTensAngleJitterDeg)
        : 0;
      tensPairAngles.set(pairIndex, MILLIMETRE_DRAWING.generatedTensAngleDeg + jitter);
    }
    const angle = degreesToRadians(tensPairAngles.get(pairIndex));
    const directionSign = (index % 2 === 0 ? 1 : -1) * tensDirection;
    const target = {
      x: point.x + Math.cos(angle) * tenLength,
      y: point.y + directionSign * Math.sin(angle) * tenLength
    };
    const segment = createSegment(point, target, 10, { kind: "ten" });
    segments.push(segment);
    point = segment.end;
  }

  if (units > 0) {
    const previous = segments[segments.length - 1] || null;
    const previousHeading = previous
      ? Math.atan2(previous.end.y - previous.start.y, previous.end.x - previous.start.x)
      : degreesToRadians(useRandom ? randomBetween(random, -40, 40) : 25);
    const turnAbsDeg = useRandom
      ? randomBetween(random, MILLIMETRE_DRAWING.generatedUnitsTurnMinDeg, MILLIMETRE_DRAWING.generatedUnitsTurnMaxDeg)
      : MILLIMETRE_DRAWING.generatedUnitsTurnMinDeg;
    const turnSign = useRandom && random() < 0.5 ? -1 : 1;
    const direction = previousHeading + degreesToRadians(turnAbsDeg * turnSign);
    const unitLength = mmToPx(units);
    const target = {
      x: point.x + Math.cos(direction) * unitLength,
      y: point.y + Math.sin(direction) * unitLength
    };
    const segment = createSegment(point, target, units, { kind: "unit" });
    segments.push(segment);
  }

  return segments;
}


function rotateGeneratedSegmentsToFit(segments, { width, height, padding, random }) {
  if (!segments.length) return segments;

  const maxRotation = Math.max(0, Number(MILLIMETRE_DRAWING.generatedFinalRotationMaxDeg) || 0);
  if (!(maxRotation > 0)) return segments;

  const desiredDeg = randomBetween(random, -maxRotation, maxRotation);
  if (Math.abs(desiredDeg) < 0.2) return segments;

  // On garde un petit espace supplémentaire pour les graduations, qui dépassent
  // toujours d'un seul côté du segment.
  const safety = Math.max(6, Number(MILLIMETRE_DRAWING.tickLengthPx) + 3);
  const maxWidth = Math.max(1, Number(width) - 2 * Math.max(0, Number(padding) || 0) - 2 * safety);
  const maxHeight = Math.max(1, Number(height) - 2 * Math.max(0, Number(padding) || 0) - 2 * safety);
  const originBounds = getSegmentsBounds(segments);
  const pivot = {
    x: originBounds.x + originBounds.width / 2,
    y: originBounds.y + originBounds.height / 2
  };

  // On tente l'angle voulu, puis 90 %, 80 %... jusqu'à 0. Cela permet de
  // conserver autant de rotation que l'espace réellement disponible l'autorise.
  for (let factor = 1; factor >= 0.099; factor -= 0.1) {
    const candidate = rotateSegments(segments, pivot, degreesToRadians(desiredDeg * factor));
    const bounds = getSegmentsBounds(candidate);
    if (bounds.width <= maxWidth && bounds.height <= maxHeight) return candidate;
  }

  return segments;
}

function rotateSegments(segments, pivot, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotatePoint = (point) => {
    const dx = Number(point.x) - Number(pivot.x);
    const dy = Number(point.y) - Number(pivot.y);
    return {
      x: Number(pivot.x) + dx * cos - dy * sin,
      y: Number(pivot.y) + dx * sin + dy * cos
    };
  };

  return segments.map((segment) => {
    const start = rotatePoint(segment.start);
    const end = rotatePoint(segment.end);
    return {
      ...segment,
      start,
      end,
      angle: Math.atan2(end.y - start.y, end.x - start.x)
    };
  });
}

function translateGeneratedSegmentsIntoViewport(segments, rawBounds, { width, height, padding, random }) {
  if (!segments.length) {
    const point = { x: padding, y: padding };
    return { segments: [], end: point };
  }

  const shapeWidth = Math.max(0, Number(rawBounds?.width) || 0);
  const shapeHeight = Math.max(0, Number(rawBounds?.height) || 0);
  const safePadX = fittingPadding(Number(width), shapeWidth, padding);
  const safePadY = fittingPadding(Number(height), shapeHeight, padding);
  const innerWidth = Math.max(1, Number(width) - safePadX * 2);
  const innerHeight = Math.max(1, Number(height) - safePadY * 2);
  const freeX = Math.max(0, innerWidth - shapeWidth);
  const freeY = Math.max(0, innerHeight - shapeHeight);
  const placementRatio = clamp01(MILLIMETRE_DRAWING.generatedPlacementJitterRatio);

  const factorX = random ? centeredPlacementFactor(random, placementRatio) : 0;
  const factorY = random ? centeredPlacementFactor(random, placementRatio) : 0;
  const targetMinX = safePadX + freeX * factorX;
  const targetMinY = safePadY + freeY * factorY;
  const dx = targetMinX - Number(rawBounds?.x || 0);
  const dy = targetMinY - Number(rawBounds?.y || 0);

  const translated = segments.map((segment) => ({
    ...segment,
    start: { x: segment.start.x + dx, y: segment.start.y + dy },
    end: { x: segment.end.x + dx, y: segment.end.y + dy }
  }));
  const last = translated[translated.length - 1];
  return {
    segments: translated,
    end: last?.end ? { ...last.end } : { x: targetMinX, y: targetMinY }
  };
}

function fittingPadding(viewportSize, shapeSize, preferredPadding) {
  const available = Math.max(0, Number(viewportSize) - Number(shapeSize));
  return Math.max(4, Math.min(Number(preferredPadding) || 0, available / 2));
}

function centeredPlacementFactor(random, ratio) {
  const jitter = (Number(random()) - 0.5) * ratio;
  return clamp01(0.5 + jitter);
}

function randomBetween(random, min, max) {
  return Number(min) + (Number(max) - Number(min)) * Number(random());
}

function createSeededRandom(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return function seededRandom() {
    state |= 0;
    state = state + 0x6d2b79f5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  const text = String(seed ?? "0");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number(min) || 0;
  return Math.max(Number(min), Math.min(Number(max), numeric));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function getSegmentsBounds(segments = [], { padding = 0 } = {}) {
  const points = [];
  segments.forEach((segment) => {
    if (segment?.start) points.push(segment.start);
    if (segment?.end) points.push(segment.end);
  });
  if (!points.length) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + padding;
  const maxY = Math.max(...ys) + padding;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

export function segmentEndPoint(segments = [], fallback = { x: 0, y: 0 }) {
  const last = segments[segments.length - 1];
  return last?.end ? { ...last.end } : { ...fallback };
}

function degreesToRadians(value) {
  return Number(value) * Math.PI / 180;
}

function fmt(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}
