import test from "node:test";
import assert from "node:assert/strict";

import {
  clampBuildTranslation,
  resolveMagnifierCountBaseline
} from "./activity.js";
import { pickQuestion, QUESTION_TYPES } from "./model.js";

test("le déplacement du tracé est bloqué sur les quatre bords", () => {
  const state = { canvasWidth: 100, canvasHeight: 80 };
  const startPoint = { x: 20, y: 20 };
  const segments = [{
    start: { x: 20, y: 20 },
    end: { x: 80, y: 60 }
  }];

  assert.deepEqual(
    clampBuildTranslation(state, 100, 100, { startPoint, segments }),
    { x: 13.5, y: 13.5 }
  );
  assert.deepEqual(
    clampBuildTranslation(state, -100, -100, { startPoint, segments }),
    { x: -13.5, y: -13.5 }
  );
});

test("un tracé presque aussi large que le canevas reste entièrement dedans", () => {
  const state = { canvasWidth: 100, canvasHeight: 80 };
  const startPoint = { x: 5, y: 5 };
  const segments = [{
    start: { x: 5, y: 5 },
    end: { x: 95, y: 75 }
  }];

  assert.deepEqual(
    clampBuildTranslation(state, 40, 40, { startPoint, segments }),
    { x: 0, y: 0 }
  );
});

test("le compteur de la loupe reste en haut lorsque le tracé ne le masque pas", () => {
  assert.equal(resolveMagnifierCountBaseline({
    diameter: 384,
    origin: { x: 192, y: 192 },
    segments: [{ start: { x: 192, y: 192 }, end: { x: 300, y: 260 } }]
  }), 28);
});

test("le compteur de la loupe passe en bas lorsqu'un tracé traverse le haut", () => {
  assert.equal(resolveMagnifierCountBaseline({
    diameter: 384,
    origin: { x: 192, y: 192 },
    segments: [{ start: { x: 192, y: 192 }, end: { x: 192, y: -40 } }]
  }), 368);
});

test("la consigne Construire par défaut ne contient pas le nombre", () => {
  const question = pickQuestion({
    questionType: QUESTION_TYPES.BUILD,
    valueMode: "list",
    valueList: [9497]
  });

  assert.equal(question.prompt, "Construis comme M. Millimètre.");
});
