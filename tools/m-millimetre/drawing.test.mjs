import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeneratedSegments,
  mmToPx
} from "./drawing.js";

const VIEWPORT = Object.freeze({ width: 1620, height: 470 });

function decomposition(value) {
  return {
    hundreds: Math.floor(value / 100),
    tens: Math.floor((value % 100) / 10),
    units: value % 10
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function jointAngleDeg(first, second) {
  const incomingX = first.start.x - first.end.x;
  const incomingY = first.start.y - first.end.y;
  const outgoingX = second.end.x - second.start.x;
  const outgoingY = second.end.y - second.start.y;
  const divisor = Math.hypot(incomingX, incomingY) * Math.hypot(outgoingX, outgoingY);
  const cosine = Math.max(-1, Math.min(1,
    (incomingX * outgoingX + incomingY * outgoingY) / divisor
  ));
  return Math.acos(cosine) * 180 / Math.PI;
}

test("les grands nombres conservent toutes leurs longueurs exactes", () => {
  for (const value of [2000, 2499, 9497, 9769, 9999]) {
    const expected = decomposition(value);
    const generated = buildGeneratedSegments(expected, { ...VIEWPORT, randomSeed: value });

    assert.equal(generated.segments.filter((segment) => segment.mm === 100).length, expected.hundreds);
    assert.equal(generated.segments.filter((segment) => segment.mm === 10).length, expected.tens);
    assert.equal(generated.segments.filter((segment) => segment.mm < 10).length, expected.units > 0 ? 1 : 0);

    for (const segment of generated.segments) {
      const actualLength = distance(segment.start, segment.end);
      assert.ok(Math.abs(actualLength - mmToPx(segment.mm)) < 1e-8);
    }
  }
});

test("un paquet complet alterne un grand puis un petit angle en éventail", () => {
  for (const value of [2000, 2499, 9497, 9769, 9999]) {
    for (const randomSeed of [1, 7, 31, 123456, 0xffffffff]) {
      const generated = buildGeneratedSegments(decomposition(value), { ...VIEWPORT, randomSeed });
      const hundreds = generated.segments.filter((segment) => segment.mm === 100);
      const fullBlockCount = Math.floor(decomposition(value).hundreds / 10);

      for (let blockIndex = 0; blockIndex < fullBlockCount; blockIndex += 1) {
        const block = hundreds.slice(blockIndex * 10, blockIndex * 10 + 10);

        for (let index = 0; index < 9; index += 2) {
          const largeAngle = jointAngleDeg(block[index], block[index + 1]);
          if (index > 0) {
            const previousSmallAngle = jointAngleDeg(block[index - 1], block[index]);
            assert.ok(largeAngle > previousSmallAngle + 0.5);
          }
          if (index + 2 < block.length) {
            const nextSmallAngle = jointAngleDeg(block[index + 1], block[index + 2]);
            assert.ok(largeAngle > nextSmallAngle + 0.5);
          }
        }
      }
    }
  }
});

test("seul l'angle entre les 10e et 11e barres sépare deux paquets", () => {
  const generated = buildGeneratedSegments(decomposition(9769), { ...VIEWPORT, randomSeed: 123456 });
  const hundreds = generated.segments.filter((segment) => segment.mm === 100);

  for (let blockIndex = 0; blockIndex < 8; blockIndex += 1) {
    const block = hundreds.slice(blockIndex * 10, blockIndex * 10 + 10);
    const nextBlock = hundreds.slice((blockIndex + 1) * 10, (blockIndex + 2) * 10);
    const ninthTenthAngle = jointAngleDeg(block[8], block[9]);
    const tenthEleventhAngle = jointAngleDeg(block[9], nextBlock[0]);
    const eleventhTwelfthAngle = jointAngleDeg(nextBlock[0], nextBlock[1]);

    assert.equal(block[9].hundredBlockBoundary, true);
    assert.ok(tenthEleventhAngle > ninthTenthAngle + 2.5);
    assert.ok(tenthEleventhAngle > eleventhTwelfthAngle + 2.5);
  }
});

test("les centaines restantes ne reçoivent pas le patron en éventail", () => {
  const generated = buildGeneratedSegments(decomposition(9769), { ...VIEWPORT, randomSeed: 123456 });
  const hundreds = generated.segments.filter((segment) => segment.mm === 100);
  const remainderTransitionAngle = jointAngleDeg(hundreds[89], hundreds[90]);
  const firstRemainderInternalAngle = jointAngleDeg(hundreds[90], hundreds[91]);

  assert.ok(remainderTransitionAngle > 20);
  assert.ok(remainderTransitionAngle > firstRemainderInternalAngle + 15);

  for (const segment of hundreds.slice(90)) {
    assert.equal(segment.hundredBlockRemainder, true);
    assert.equal(segment.hundredFanPairIndex, null);
  }
});

test("les valeurs maximales restent contenues dans le SVG de lecture", () => {
  for (const randomSeed of [1, 7, 31, 123456, 0xffffffff]) {
    const generated = buildGeneratedSegments(decomposition(9999), { ...VIEWPORT, randomSeed });

    assert.ok(Number.isFinite(generated.requiredWidth));
    assert.ok(Number.isFinite(generated.requiredHeight));
    for (const segment of generated.segments) {
      for (const point of [segment.start, segment.end]) {
        assert.ok(point.x >= 0 && point.x <= generated.requiredWidth + 1e-8);
        assert.ok(point.y >= 0 && point.y <= generated.requiredHeight + 1e-8);
      }
    }
  }
});

test("les valeurs de 9 000 à 9 999 ne créent jamais de scroll horizontal", () => {
  const cases = [
    { value: 9000, width: 1620, randomSeed: 1 },
    { value: 9497, width: 1620, randomSeed: 31 },
    { value: 9769, width: 1620, randomSeed: 123456 },
    { value: 9999, width: 1620, randomSeed: 246 },
    { value: 9999, width: 1024, randomSeed: 246 },
    { value: 9999, width: 720, randomSeed: 246 }
  ];

  for (const { value, width, randomSeed } of cases) {
    const generated = buildGeneratedSegments(decomposition(value), {
      width,
      height: VIEWPORT.height,
      randomSeed
    });
    assert.ok(generated.requiredWidth <= width + 1e-8, `${value} sur ${width}px`);
  }
});
