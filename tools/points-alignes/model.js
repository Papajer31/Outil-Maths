export const MODES = Object.freeze({
  GROUPS: "groups",
  WITH_AB: "with-ab",
  DOUBLE_ALIGNMENT: "double-alignment"
});

export const DIFFICULTIES = Object.freeze({
  TRIVIAL: "trivial",
  MODERATE: "moderate",
  DEMANDING: "demanding"
});

export const DRAWING_PERSISTENCE = Object.freeze({
  ALL: "all",
  LAST_ONLY: "last-only",
  NONE: "none"
});

export const BOARD = Object.freeze({
  width: 1180,
  height: 650,
  margin: 60,
  minPointDistance: 58,
  alignmentTolerance: 6,
  nearAlignmentMin: 14,
  nearAlignmentMax: 24
});

const LIMITS = Object.freeze({
  groupCount: { min: 1, max: 2 },
  alignedCount: { min: 1, max: 5 },
  distractorCount: { min: 0, max: 12 }
});

const GROUP_RECT = Object.freeze({
  left: BOARD.width * 0.1,
  right: BOARD.width * 0.9,
  top: BOARD.height * 0.1,
  bottom: BOARD.height * 0.9
});

const GROUP_MIN_POINT_DISTANCE = 68;

export function getDefaultSettings() {
  return {
    mode: MODES.GROUPS,
    groupCount: 1,
    alignedCount: 2,
    distractorCount: 6,
    difficulty: DIFFICULTIES.MODERATE,
    drawingPersistence: DRAWING_PERSISTENCE.ALL
  };
}

export function normalizeSettings(settings = {}) {
  const fallback = getDefaultSettings();
  const mode = normalizeMode(settings?.mode, fallback.mode);
  const groupCount = clampInt(settings?.groupCount, LIMITS.groupCount.min, LIMITS.groupCount.max, fallback.groupCount);
  const rawDistractorCount = clampInt(settings?.distractorCount, LIMITS.distractorCount.min, LIMITS.distractorCount.max, fallback.distractorCount);
  return {
    mode,
    groupCount,
    alignedCount: clampInt(settings?.alignedCount, LIMITS.alignedCount.min, LIMITS.alignedCount.max, fallback.alignedCount),
    distractorCount: mode === MODES.GROUPS ? Math.max(rawDistractorCount, groupCount * 3) : rawDistractorCount,
    difficulty: normalizeDifficulty(settings?.difficulty, fallback.difficulty),
    drawingPersistence: normalizeDrawingPersistence(settings?.drawingPersistence, fallback.drawingPersistence)
  };
}

export function pickQuestion(settings = {}, { avoidKey = "", attempts = 180 } = {}) {
  const cfg = normalizeSettings(settings);
  const groupsLayout = cfg.mode === MODES.GROUPS
    ? {
        solutionOrientations: Array.from(
          { length: Math.max(1, Math.min(2, Number(cfg.groupCount) || 1)) },
          () => Math.random() < 0.5 ? "left-right" : "top-bottom"
        ),
        mirrorHorizontally: Math.random() < 0.5
      }
    : null;
  let last = null;

  for (let attempt = 0; attempt < Math.max(1, Number(attempts) || 180); attempt += 1) {
    const question = cfg.mode === MODES.WITH_AB
      ? generateWithABQuestion(cfg)
      : cfg.mode === MODES.DOUBLE_ALIGNMENT
        ? generateDoubleAlignmentQuestion(cfg)
        : generateGroupsQuestion(cfg, groupsLayout);

    if (!question) continue;
    question.key = buildQuestionKey(question);
    last = question;
    if (!avoidKey || question.key !== avoidKey) return question;
  }

  return last;
}

export function questionKey(question) {
  return String(question?.key || buildQuestionKey(question));
}

export function evaluateSelection(question, selectedIds = []) {
  const selectableIds = new Set((question?.points || [])
    .filter((point) => point?.selectable !== false)
    .map((point) => String(point.id)));
  const selected = uniqueStrings(selectedIds).filter((id) => selectableIds.has(id));
  const expected = uniqueStrings(question?.expectedIds || []).filter((id) => selectableIds.has(id));
  const selectedSet = new Set(selected);
  const expectedSet = new Set(expected);

  return {
    answered: selected.length > 0,
    isCorrect: selected.length === expected.length && selected.every((id) => expectedSet.has(id)),
    selectedIds: selected,
    expectedIds: expected,
    correctSelectedIds: selected.filter((id) => expectedSet.has(id)),
    incorrectSelectedIds: selected.filter((id) => !expectedSet.has(id)),
    missedIds: expected.filter((id) => !selectedSet.has(id))
  };
}

export function getPrompt(question) {
  return String(question?.prompt || "").trim();
}

function generateGroupsQuestion(cfg, layout = {}) {
  const groupCount = Math.max(1, Math.min(2, Number(cfg.groupCount) || 1));
  const distractorCount = Math.max(groupCount * 3, Number(cfg.distractorCount) || 0);
  const solutionOrientations = Array.isArray(layout?.solutionOrientations)
    ? layout.solutionOrientations
    : [];
  const mirrorHorizontally = layout?.mirrorHorizontally === true;

  for (let outer = 0; outer < 220; outer += 1) {
    const groups = [];
    const points = [];
    let nextDistractorIndex = 1;
    let valid = true;

    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const solutionOrientation = solutionOrientations[groupIndex] === "top-bottom" ? "top-bottom" : "left-right";
      const group = createStructuredSolutionGroup(`g${groupIndex + 1}`, points, groups, solutionOrientation);
      if (!group) {
        valid = false;
        break;
      }
      groups.push(group);
      points.push(...group.points);
    }
    if (!valid) continue;

    const spoiler = createNearSolutionDistractor(groups, points, `d-${nextDistractorIndex}`);
    if (!spoiler) continue;
    points.push(spoiler);
    nextDistractorIndex += 1;

    const horizontalGuards = createHorizontalExtremeDistractors({
      idStart: nextDistractorIndex,
      existing: points,
      groups
    });
    if (!horizontalGuards) continue;
    points.push(...horizontalGuards);
    nextDistractorIndex += horizontalGuards.length;

    let remaining = distractorCount - 1 - horizontalGuards.length;
    while (remaining > 0) {
      const chunkSize = Math.min(remaining, chooseChordChunkSize(remaining));
      const cluster = createChordDistractorCluster({
        size: chunkSize,
        idStart: nextDistractorIndex,
        existing: points,
        groups
      });
      if (!cluster) {
        valid = false;
        break;
      }
      points.push(...cluster);
      nextDistractorIndex += cluster.length;
      remaining -= cluster.length;
    }
    if (!valid) continue;

    const allowedTriples = new Set(groups.map((group) => tripleKey(group.points.map((point) => point.id))));
    if (!repairAndValidateFigure(points, { allowedTriples, groups })) continue;
    if (!hasDistractorHorizontalExtremes(points)) continue;

    const expectedIds = groups.flatMap((group) => group.points.map((point) => point.id));
    const displayedPoints = mirrorHorizontally
      ? points.map(mirrorPointHorizontally)
      : points;
    return {
      mode: MODES.GROUPS,
      prompt: groupCount === 1
        ? "Sélectionne les trois points alignés."
        : "Sélectionne tous les points qui forment deux groupes de trois points alignés.",
      points: shuffle(displayedPoints).map(copyPoint),
      expectedIds,
      groupCount,
      difficulty: cfg.difficulty,
      distractorCount
    };
  }
  return null;
}

function generateWithABQuestion(cfg) {
  for (let outer = 0; outer < 160; outer += 1) {
    const line = createLongLine();
    if (!line) continue;

    const tPool = shuffle([0.05, 0.31, 0.43, 0.57, 0.69, 0.95]);
    const referenceTs = [0.18, 0.82];
    const selectedTs = tPool.slice(0, cfg.alignedCount).sort((a, b) => a - b);
    if (selectedTs.length !== cfg.alignedCount) continue;

    const a = pointOnLine(line, referenceTs[0], { id: "ref-a", label: "A", selectable: false, role: "reference" });
    const b = pointOnLine(line, referenceTs[1], { id: "ref-b", label: "B", selectable: false, role: "reference" });
    const targets = selectedTs.map((t, index) => pointOnLine(line, t, {
      id: `target-${index + 1}`,
      selectable: true,
      role: "target"
    }));
    const core = [a, b, ...targets];

    if (!hasSafePointSpacing(core)) continue;

    const distractors = createDistractors({
      count: cfg.distractorCount,
      difficulty: cfg.difficulty,
      existing: core,
      lines: [line]
    });
    if (!distractors) continue;

    const points = [...core, ...distractors];
    const mainIds = new Set(core.map((point) => point.id));
    if (!validateFigure(points, {
      allowAlignedTriple(ids) {
        return ids.every((id) => mainIds.has(id));
      }
    })) continue;

    return {
      mode: MODES.WITH_AB,
      prompt: "Sélectionne tous les points alignés avec A et B.",
      points: shuffleKeepingReferences(points, ["ref-a", "ref-b"]).map(copyPoint),
      expectedIds: targets.map((point) => point.id),
      alignedCount: cfg.alignedCount,
      difficulty: cfg.difficulty,
      distractorCount: cfg.distractorCount
    };
  }
  return null;
}

function generateDoubleAlignmentQuestion(cfg) {
  for (let outer = 0; outer < 180; outer += 1) {
    const target = {
      x: randomBetween(360, 820),
      y: randomBetween(235, 415)
    };
    const angle1 = randomBetween(-72, 72) * Math.PI / 180;
    let angle2 = angle1 + randomBetween(48, 118) * Math.PI / 180;
    angle2 = normalizeAngle(angle2);

    const line1 = centeredLine(target, angle1, randomBetween(245, 320));
    const line2 = centeredLine(target, angle2, randomBetween(235, 300));
    if (!lineInsideBoard(line1) || !lineInsideBoard(line2)) continue;

    const a = pointAtSignedDistance(target, angle1, -randomBetween(175, 245), { id: "ref-a", label: "A", selectable: false, role: "reference" });
    const b = pointAtSignedDistance(target, angle1, randomBetween(175, 245), { id: "ref-b", label: "B", selectable: false, role: "reference" });
    const c = pointAtSignedDistance(target, angle2, -randomBetween(165, 235), { id: "ref-c", label: "C", selectable: false, role: "reference" });
    const d = pointAtSignedDistance(target, angle2, randomBetween(165, 235), { id: "ref-d", label: "D", selectable: false, role: "reference" });
    const answer = { id: "target-1", x: target.x, y: target.y, selectable: true, role: "target", label: "" };
    const core = [a, b, c, d, answer];
    if (!hasSafePointSpacing(core)) continue;

    const distractors = createDistractors({
      count: cfg.distractorCount,
      difficulty: cfg.difficulty,
      existing: core,
      lines: [line1, line2]
    });
    if (!distractors) continue;
    const points = [...core, ...distractors];

    const allowedTriples = new Set([
      tripleKey([a.id, b.id, answer.id]),
      tripleKey([c.id, d.id, answer.id])
    ]);
    if (!validateFigure(points, { allowedTriples })) continue;

    return {
      mode: MODES.DOUBLE_ALIGNMENT,
      prompt: "Quel point est aligné à la fois avec A et B mais aussi avec C et D ?",
      points: shuffleKeepingReferences(points, ["ref-a", "ref-b", "ref-c", "ref-d"]).map(copyPoint),
      expectedIds: [answer.id],
      difficulty: cfg.difficulty,
      distractorCount: cfg.distractorCount
    };
  }
  return null;
}

function createStructuredSolutionGroup(groupId, existing = [], existingGroups = [], orientation = "left-right") {
  for (let attempt = 0; attempt < 220; attempt += 1) {
    const chord = createOppositeSidesChord(GROUP_RECT, orientation);
    if (!chord) continue;

    const middleT = randomBetween(0.28, 0.72);
    const points = [
      pointOnLine(chord, 0, { id: `${groupId}-p1`, selectable: true, role: "target", groupId }),
      pointOnLine(chord, middleT, { id: `${groupId}-p2`, selectable: true, role: "target", groupId }),
      pointOnLine(chord, 1, { id: `${groupId}-p3`, selectable: true, role: "target", groupId })
    ];

    if (!hasMinimumPointSpacing([...existing, ...points], GROUP_MIN_POINT_DISTANCE)) continue;
    if (existingGroups.some((group) => !groupsCanCoexist(group, { points, line: chord }))) continue;
    return {
      points,
      line: chord
    };
  }
  return null;
}

function groupsCanCoexist(left, right) {
  const intersection = lineIntersection(left.line.a, left.line.b, right.line.a, right.line.b);
  if (!intersection) return true;
  if (!pointInsideRect(intersection, GROUP_RECT)) return true;
  const allPoints = [...left.points, ...right.points];
  return allPoints.every((point) => distance(point, intersection) >= BOARD.minPointDistance * 1.05);
}

function createNearSolutionDistractor(groups, existing, id) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const group = groups[Math.floor(Math.random() * groups.length)];
    const edgeBias = Math.random() < 0.5 ? randomBetween(0.03, 0.1) : randomBetween(0.9, 0.97);
    const base = pointOnLine(group.line, edgeBias, {});
    const candidate = offsetPointFromLine(group.line, base, randomBetween(BOARD.nearAlignmentMin, BOARD.nearAlignmentMax), Math.random() < 0.5 ? -1 : 1, {
      id,
      selectable: true,
      role: "distractor",
      label: ""
    });
    if (!pointInsideBoard(candidate)) continue;
    if (!hasMinimumPointSpacing([...existing, candidate], GROUP_MIN_POINT_DISTANCE)) continue;
    return candidate;
  }
  return null;
}

function createHorizontalExtremeDistractors({ idStart, existing, groups }) {
  const boardLeft = BOARD.margin + 6;
  const boardRight = BOARD.width - BOARD.margin - 6;
  const leftMax = GROUP_RECT.left - 10;
  const rightMin = GROUP_RECT.right + 10;
  const innerHeight = GROUP_RECT.bottom - GROUP_RECT.top;

  for (let attempt = 0; attempt < 220; attempt += 1) {
    const leftY = randomBetween(
      GROUP_RECT.top + innerHeight * 0.2,
      GROUP_RECT.bottom - innerHeight * 0.2
    );
    const rightY = randomBetween(
      GROUP_RECT.top + innerHeight * 0.2,
      GROUP_RECT.bottom - innerHeight * 0.2
    );
    const chord = {
      a: { x: GROUP_RECT.left, y: leftY },
      b: { x: GROUP_RECT.right, y: rightY }
    };

    const leftX = randomBetween(boardLeft, leftMax);
    const rightX = randomBetween(rightMin, boardRight);
    const leftT = (leftX - chord.a.x) / (chord.b.x - chord.a.x);
    const rightT = (rightX - chord.a.x) / (chord.b.x - chord.a.x);
    const pair = [
      pointOnLine(chord, leftT, {
        id: `d-${idStart}`,
        selectable: true,
        role: "distractor",
        label: ""
      }),
      pointOnLine(chord, rightT, {
        id: `d-${idStart + 1}`,
        selectable: true,
        role: "distractor",
        label: ""
      })
    ];

    if (pair.some((point) => !pointInsideBoard(point))) continue;
    if (!hasMinimumPointSpacing([...existing, ...pair], GROUP_MIN_POINT_DISTANCE)) continue;
    if (groups.some((group) => pair.some((point) => distancePointToInfiniteLine(point, group.line.a, group.line.b) <= BOARD.alignmentTolerance))) continue;
    return pair;
  }
  return null;
}

function hasDistractorHorizontalExtremes(points) {
  const list = Array.isArray(points) ? points : [];
  if (!list.length) return false;
  let left = list[0];
  let right = list[0];
  for (const point of list) {
    if (point.x < left.x) left = point;
    if (point.x > right.x) right = point;
  }
  return String(left.role) === "distractor" && String(right.role) === "distractor";
}

function chooseChordChunkSize(remaining) {
  if (remaining <= 3) return remaining;
  const roll = Math.random();
  if (roll < 0.28) return 1;
  if (roll < 0.66) return 2;
  return 3;
}

function createChordDistractorCluster({ size, idStart, existing, groups }) {
  for (let attempt = 0; attempt < 260; attempt += 1) {
    const innerChord = createOppositeSidesChord(GROUP_RECT);
    if (!innerChord) continue;
    const boardChord = extendLineToRect(innerChord, {
      left: BOARD.margin,
      right: BOARD.width - BOARD.margin,
      top: BOARD.margin,
      bottom: BOARD.height - BOARD.margin
    });
    if (!boardChord) continue;

    const useOuterPoint = Math.random() < 0.42;
    const sourceLine = boardChord;
    let positions;

    if (size === 1) {
      positions = [useOuterPoint ? chooseOuterT(innerChord, boardChord) : randomBetween(0.08, 0.92)];
    } else if (size === 2) {
      positions = useOuterPoint
        ? [chooseOuterT(innerChord, boardChord), Math.random() < 0.5 ? randomBetween(0.28, 0.44) : randomBetween(0.56, 0.72)]
        : [randomBetween(0.06, 0.2), randomBetween(0.8, 0.94)];
    } else {
      positions = useOuterPoint
        ? [chooseOuterT(innerChord, boardChord), randomBetween(0.4, 0.54), Math.random() < 0.5 ? randomBetween(0.72, 0.88) : randomBetween(0.12, 0.28)]
        : [randomBetween(0.05, 0.16), randomBetween(0.43, 0.57), randomBetween(0.84, 0.95)];
    }

    positions = positions.map((t) => clampNumber(t, 0.015, 0.985));
    const cluster = positions.map((t, index) => pointOnLine(sourceLine, t, {
      id: `d-${idStart + index}`,
      selectable: true,
      role: "distractor",
      label: ""
    }));

    if (size === 3) {
      const offsetIndex = Math.floor(Math.random() * 3);
      cluster[offsetIndex] = offsetPointFromLine(
        sourceLine,
        cluster[offsetIndex],
        randomBetween(BOARD.nearAlignmentMin, BOARD.nearAlignmentMax),
        Math.random() < 0.5 ? -1 : 1,
        cluster[offsetIndex]
      );
    }

    if (cluster.some((point) => !pointInsideBoard(point))) continue;
    if (!hasMinimumPointSpacing([...existing, ...cluster], GROUP_MIN_POINT_DISTANCE)) continue;
    if (groups.some((group) => cluster.some((point) => distancePointToInfiniteLine(point, group.line.a, group.line.b) <= BOARD.alignmentTolerance))) continue;
    return cluster;
  }
  return null;
}

function repairAndValidateFigure(points, { allowedTriples, groups }) {
  if (!hasMinimumPointSpacing(points, GROUP_MIN_POINT_DISTANCE)) return false;
  const list = Array.isArray(points) ? points : [];

  for (let round = 0; round < 180; round += 1) {
    const issue = findUnexpectedAlignedTriple(list, allowedTriples);
    if (!issue) return true;
    if (!repairUnexpectedAlignedTriple(list, issue, groups)) return false;
  }
  return validateFigure(list, { allowedTriples });
}

function findUnexpectedAlignedTriple(points, allowedTriples) {
  const list = Array.isArray(points) ? points : [];
  for (let i = 0; i < list.length - 2; i += 1) {
    for (let j = i + 1; j < list.length - 1; j += 1) {
      for (let k = j + 1; k < list.length; k += 1) {
        const triple = [list[i], list[j], list[k]];
        const ids = triple.map((point) => String(point.id));
        if (allowedTriples instanceof Set && allowedTriples.has(tripleKey(ids))) continue;
        const alignment = getAlignmentIssue(triple[0], triple[1], triple[2]);
        if (alignment) return alignment;
      }
    }
  }
  return null;
}

function getAlignmentIssue(a, b, c) {
  const pairs = [
    [a, b, c],
    [a, c, b],
    [b, c, a]
  ].sort((left, right) => distance(right[0], right[1]) - distance(left[0], left[1]));
  const [p1, p2, probe] = pairs[0];
  const span = distance(p1, p2);
  if (span < BOARD.minPointDistance) return null;
  const offDistance = distancePointToInfiniteLine(probe, p1, p2);
  if (offDistance > BOARD.alignmentTolerance) return null;
  return { points: [a, b, c], p1, p2, probe, span, offDistance };
}

function repairUnexpectedAlignedTriple(points, issue, groups) {
  const distractors = issue.points.filter((point) => String(point.role) === "distractor");
  const preferred = distractors.includes(issue.probe)
    ? [issue.probe, ...distractors.filter((point) => point !== issue.probe)]
    : distractors;

  for (const target of preferred) {
    if (tryNudgeDistractor(points, target, issue, groups)) return true;
  }
  return false;
}

function tryNudgeDistractor(points, target, issue, groups) {
  const line = { a: issue.p1, b: issue.p2 };
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;

  const original = { x: target.x, y: target.y };
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const desiredGap = randomBetween(BOARD.nearAlignmentMin, BOARD.nearAlignmentMax);
    const currentGap = distancePointToInfiniteLine(target, line.a, line.b);
    const baseShift = Math.max(desiredGap - currentGap, desiredGap * 0.9);
    const sign = Math.random() < 0.5 ? -1 : 1;
    const tangential = randomBetween(-14, 14);
    target.x = original.x + nx * baseShift * sign + (dx / length) * tangential;
    target.y = original.y + ny * baseShift * sign + (dy / length) * tangential;

    if (!pointInsideBoard(target)) continue;
    if (!hasMinimumPointSpacing(points, GROUP_MIN_POINT_DISTANCE)) continue;
    if (groups.some((group) => distancePointToInfiniteLine(target, group.line.a, group.line.b) <= BOARD.alignmentTolerance)) continue;
    return true;
  }
  target.x = original.x;
  target.y = original.y;
  return false;
}

function createLongLine() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const angle = randomBetween(-68, 68) * Math.PI / 180;
    const halfLength = randomBetween(270, 360);
    const center = {
      x: randomBetween(420, 760),
      y: randomBetween(250, 400)
    };
    const line = centeredLine(center, angle, halfLength);
    if (lineInsideBoard(line)) return line;
  }
  return null;
}

function createDistractors({ count, difficulty, existing, lines }) {
  const result = [];
  const total = Math.max(0, Number(count) || 0);
  for (let index = 0; index < total; index += 1) {
    let found = null;
    for (let attempt = 0; attempt < 900; attempt += 1) {
      const candidate = createDistractorCandidate(difficulty, lines, `d-${index + 1}`);
      const current = [...existing, ...result];
      if (!pointInsideBoard(candidate)) continue;
      if (!hasSafePointSpacing([...current, candidate])) continue;
      if (lines.some((line) => distancePointToInfiniteLine(candidate, line.a, line.b) <= BOARD.alignmentTolerance * 1.8)) continue;
      found = candidate;
      break;
    }
    if (!found) return null;
    result.push(found);
  }
  return result;
}

function createDistractorCandidate(difficulty, lines, id) {
  const mode = normalizeDifficulty(difficulty, DIFFICULTIES.MODERATE);
  if (!lines.length || (mode === DIFFICULTIES.TRIVIAL && Math.random() < 0.42)) {
    return {
      id,
      x: randomBetween(BOARD.margin, BOARD.width - BOARD.margin),
      y: randomBetween(BOARD.margin, BOARD.height - BOARD.margin),
      selectable: true,
      role: "distractor",
      label: ""
    };
  }

  const line = lines[Math.floor(Math.random() * lines.length)];
  const t = randomBetween(0.02, 0.98);
  const base = pointOnLine(line, t, {});
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const sign = Math.random() < 0.5 ? -1 : 1;
  const offset = mode === DIFFICULTIES.DEMANDING
    ? randomBetween(18, 38)
    : mode === DIFFICULTIES.MODERATE
      ? randomBetween(52, 92)
      : randomBetween(118, 185);

  return {
    id,
    x: base.x + nx * offset * sign,
    y: base.y + ny * offset * sign,
    selectable: true,
    role: "distractor",
    label: ""
  };
}

function validateFigure(points, { allowedTriples = null, allowAlignedTriple = null } = {}) {
  if (!hasSafePointSpacing(points)) return false;
  const list = Array.isArray(points) ? points : [];

  for (let i = 0; i < list.length - 2; i += 1) {
    for (let j = i + 1; j < list.length - 1; j += 1) {
      for (let k = j + 1; k < list.length; k += 1) {
        const triple = [list[i], list[j], list[k]];
        if (!areVisuallyAligned(triple[0], triple[1], triple[2])) continue;
        const ids = triple.map((point) => String(point.id));
        if (typeof allowAlignedTriple === "function" && allowAlignedTriple(ids, triple)) continue;
        if (allowedTriples instanceof Set && allowedTriples.has(tripleKey(ids))) continue;
        return false;
      }
    }
  }
  return true;
}

function areVisuallyAligned(a, b, c) {
  return Boolean(getAlignmentIssue(a, b, c));
}

function hasMinimumPointSpacing(points, minDistance) {
  const list = Array.isArray(points) ? points : [];
  const threshold = Math.max(0, Number(minDistance) || 0);
  for (let i = 0; i < list.length - 1; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (distance(list[i], list[j]) < threshold) return false;
    }
  }
  return true;
}

function hasSafePointSpacing(points) {
  return hasMinimumPointSpacing(points, BOARD.minPointDistance);
}

function centeredLine(center, angle, halfLength) {
  return {
    a: pointAtSignedDistance(center, angle, -halfLength, {}),
    b: pointAtSignedDistance(center, angle, halfLength, {})
  };
}

function pointAtSignedDistance(origin, angle, amount, extra = {}) {
  return {
    ...extra,
    x: origin.x + Math.cos(angle) * amount,
    y: origin.y + Math.sin(angle) * amount,
    label: extra.label || ""
  };
}

function pointOnLine(line, t, extra = {}) {
  return {
    ...extra,
    x: line.a.x + (line.b.x - line.a.x) * t,
    y: line.a.y + (line.b.y - line.a.y) * t,
    label: extra.label || ""
  };
}

function offsetPointFromLine(line, point, offset, sign, extra = {}) {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  return {
    ...extra,
    x: point.x + nx * offset * sign,
    y: point.y + ny * offset * sign,
    label: extra.label || ""
  };
}

function createOppositeSidesChord(rect, orientation = "random") {
  const horizontal = orientation === "left-right"
    ? true
    : orientation === "top-bottom"
      ? false
      : Math.random() < 0.5;
  if (horizontal) {
    const a = { x: rect.left, y: randomBetween(rect.top, rect.bottom) };
    const b = { x: rect.right, y: randomBetween(rect.top, rect.bottom) };
    if (distance(a, b) < 0.78 * (rect.right - rect.left)) return null;
    return { a, b };
  }

  const a = { x: randomBetween(rect.left, rect.right), y: rect.top };
  const b = { x: randomBetween(rect.left, rect.right), y: rect.bottom };
  if (distance(a, b) < 0.78 * (rect.bottom - rect.top)) return null;
  return { a, b };
}

function mirrorPointHorizontally(point) {
  return {
    ...point,
    x: BOARD.width - Number(point.x)
  };
}

function extendLineToRect(line, rect) {
  const center = {
    x: (line.a.x + line.b.x) / 2,
    y: (line.a.y + line.b.y) / 2
  };
  const direction = {
    x: line.b.x - line.a.x,
    y: line.b.y - line.a.y
  };
  const intersections = dedupePoints(lineRectIntersections(rect, center, direction));
  if (intersections.length < 2) return null;
  intersections.sort((left, right) => left.t - right.t);
  return {
    a: { x: intersections[0].x, y: intersections[0].y },
    b: { x: intersections[intersections.length - 1].x, y: intersections[intersections.length - 1].y }
  };
}

function chooseOuterT(innerChord, boardChord) {
  const t1 = projectionParameter(innerChord.a, boardChord);
  const t2 = projectionParameter(innerChord.b, boardChord);
  const low = Math.min(t1, t2);
  const high = Math.max(t1, t2);
  const canUseBefore = low > 0.035;
  const canUseAfter = high < 0.965;
  if (canUseBefore && canUseAfter) {
    return Math.random() < 0.5 ? randomBetween(0.015, low - 0.01) : randomBetween(high + 0.01, 0.985);
  }
  if (canUseBefore) return randomBetween(0.015, low - 0.01);
  if (canUseAfter) return randomBetween(high + 0.01, 0.985);
  return Math.random() < 0.5 ? randomBetween(0.02, 0.12) : randomBetween(0.88, 0.98);
}

function projectionParameter(point, line) {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const denom = dx * dx + dy * dy;
  if (!(denom > 0)) return 0.5;
  return ((point.x - line.a.x) * dx + (point.y - line.a.y) * dy) / denom;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function createRectChord(rect, center, angle) {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const intersections = lineRectIntersections(rect, center, direction);
  if (intersections.length < 2) return null;
  const unique = dedupePoints(intersections);
  if (unique.length < 2) return null;
  unique.sort((left, right) => left.t - right.t);
  const a = { x: unique[0].x, y: unique[0].y };
  const b = { x: unique[unique.length - 1].x, y: unique[unique.length - 1].y };
  if (distance(a, b) < 220) return null;
  return { a, b };
}

function lineRectIntersections(rect, origin, direction) {
  const results = [];
  const { left, right, top, bottom } = rect;
  if (Math.abs(direction.x) > 1e-6) {
    const tLeft = (left - origin.x) / direction.x;
    const yLeft = origin.y + tLeft * direction.y;
    if (yLeft >= top - 1e-6 && yLeft <= bottom + 1e-6) results.push({ x: left, y: yLeft, t: tLeft });
    const tRight = (right - origin.x) / direction.x;
    const yRight = origin.y + tRight * direction.y;
    if (yRight >= top - 1e-6 && yRight <= bottom + 1e-6) results.push({ x: right, y: yRight, t: tRight });
  }
  if (Math.abs(direction.y) > 1e-6) {
    const tTop = (top - origin.y) / direction.y;
    const xTop = origin.x + tTop * direction.x;
    if (xTop >= left - 1e-6 && xTop <= right + 1e-6) results.push({ x: xTop, y: top, t: tTop });
    const tBottom = (bottom - origin.y) / direction.y;
    const xBottom = origin.x + tBottom * direction.x;
    if (xBottom >= left - 1e-6 && xBottom <= right + 1e-6) results.push({ x: xBottom, y: bottom, t: tBottom });
  }
  return results;
}

function dedupePoints(points) {
  const result = [];
  for (const point of points) {
    if (!result.some((other) => Math.abs(other.x - point.x) < 0.5 && Math.abs(other.y - point.y) < 0.5)) {
      result.push(point);
    }
  }
  return result;
}

function randomPointInRect(rect, from = 0, to = 1) {
  const safeFrom = Math.max(0, Math.min(1, from));
  const safeTo = Math.max(safeFrom, Math.min(1, to));
  return {
    x: randomBetween(rect.left + (rect.right - rect.left) * safeFrom, rect.left + (rect.right - rect.left) * safeTo),
    y: randomBetween(rect.top + (rect.bottom - rect.top) * safeFrom, rect.top + (rect.bottom - rect.top) * safeTo)
  };
}

function pointInsideBoard(point) {
  return point.x >= BOARD.margin
    && point.x <= BOARD.width - BOARD.margin
    && point.y >= BOARD.margin
    && point.y <= BOARD.height - BOARD.margin;
}

function pointInsideRect(point, rect) {
  return point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom;
}

function lineInsideBoard(line) {
  return pointInsideBoard(line.a) && pointInsideBoard(line.b);
}

function lineIntersection(a, b, c, d) {
  const determinant = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(determinant) < 1e-6) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / determinant;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function distancePointToInfiniteLine(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = Math.hypot(dx, dy);
  if (!(denominator > 0)) return Infinity;
  return Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / denominator;
}

function distance(a, b) {
  return Math.hypot(Number(a?.x) - Number(b?.x), Number(a?.y) - Number(b?.y));
}

function tripleKey(ids) {
  return [...ids].map(String).sort().join("|");
}

function buildQuestionKey(question) {
  const points = (question?.points || [])
    .map((point) => `${point.id}:${Math.round(point.x)}:${Math.round(point.y)}`)
    .sort()
    .join(";");
  return `${question?.mode || ""}|${points}`;
}

function shuffleKeepingReferences(points, referenceIds) {
  const refs = new Set(referenceIds.map(String));
  const references = points.filter((point) => refs.has(String(point.id)));
  const others = shuffle(points.filter((point) => !refs.has(String(point.id))));
  return [...references, ...others];
}

function copyPoint(point) {
  return {
    id: String(point?.id || ""),
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    label: String(point?.label || ""),
    selectable: point?.selectable !== false,
    role: String(point?.role || "distractor"),
    groupId: String(point?.groupId || "")
  };
}

function normalizeMode(value, fallback) {
  const allowed = new Set(Object.values(MODES));
  const normalized = String(value || "").trim();
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeDifficulty(value, fallback) {
  const allowed = new Set(Object.values(DIFFICULTIES));
  const normalized = String(value || "").trim();
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeDrawingPersistence(value, fallback) {
  const allowed = new Set(Object.values(DRAWING_PERSISTENCE));
  const normalized = String(value || "").trim();
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  const safe = Number.isFinite(number) ? number : fallback;
  return Math.max(min, Math.min(max, safe));
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
