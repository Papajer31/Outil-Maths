// Run: node --test --test-isolation=none _dev/regression-tests/fusee-shuttle.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getShuttleHeading } from '../../games/fusee/shuttle-motion.js';

test('Le cockpit pointe vers sa destination dans les huit directions', () => {
  for (const [x, y] of [[1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1], [0,-1], [1,-1]]) {
    const heading = getShuttleHeading({ x:0, y:0 }, { x, y });
    const radians = heading.rotation * Math.PI / 180;
    const length = Math.hypot(x, y);
    assert.ok(Math.abs(heading.flip * Math.cos(radians) - x / length) < 1e-10, `Cockpit X : ${x}, ${y}`);
    assert.ok(Math.abs(heading.flip * Math.sin(radians) - y / length) < 1e-10, `Cockpit Y : ${x}, ${y}`);
    assert.equal(heading.flip, x < 0 ? -1 : 1);
  }
});

test('La rotation choisit le petit pivot autour de la verticale', () => {
  const heading = getShuttleHeading({ x:0, y:0 }, { x:0.1, y:-1 }, 275);
  assert.ok(Math.abs(heading.rotation - 275) < 10);
});

test('Un rafraîchissement sans déplacement ne change pas la direction', () => {
  assert.equal(getShuttleHeading({ x:10, y:20 }, { x:10, y:20 }, 90), null);
});
