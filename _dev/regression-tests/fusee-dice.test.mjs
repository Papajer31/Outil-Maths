// Run: node --test --test-isolation=none _dev/regression-tests/fusee-dice.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const context = vm.createContext({});
vm.runInContext(await fs.readFile(new URL("../../games/fusee/engine.js", import.meta.url), "utf8"), context);
const { Game, KEYS } = context.FuseeEngine;
function makeGame() {
  return new Game({
    players:["Léa", "Noah"], duration:30, dust:3,
    targets:Object.fromEntries(KEYS.map(key => [key, key === "carburant" ? 3 : 0])),
    activities:{ carburant:{ id:"addition", level:3, snapshot:{ config_json:{ tool_id:"addition" } } } }
  }, () => 0);
}
function finishTurn(game) {
  game.acceptRoll();
  while (game.phase === "move") game.move(game.options()[0]);
  game.resolve();
  assert.equal(game.phase, "notice");
  game.continue();
}

test("Deux joueurs successifs ne peuvent pas tirer la fusée deux fois de suite", () => {
  const game = makeGame();
  assert.equal(game.roll(), "rocket");
  const firstPlayer = game.active;
  finishTurn(game);
  assert.notEqual(game.active, firstPlayer);
  assert.equal(game.roll(), 2);
  finishTurn(game);
  assert.equal(game.roll(), "rocket", "La fusée redevient possible après un autre résultat.");
});

for (const resumeDuringRoll of [true, false]) {
  test(`La règle persiste après une reprise ${resumeDuringRoll ? "avant" : "après"} validation du dé`, () => {
    const game = makeGame();
    assert.equal(game.roll(), "rocket");
    if (!resumeDuringRoll) finishTurn(game);
    const restored = Game.restore(JSON.parse(JSON.stringify(game.snapshot())), () => 0);
    if (resumeDuringRoll) finishTurn(restored);
    assert.equal(restored.roll(), 2);
  });
}

test("Un plateau sans déplacement possible propose l'astéroïde après la fusée", () => {
  const game = makeGame();
  assert.equal(game.roll(), "rocket");
  finishTurn(game);
  for (const id of game.board.nodes.c.neighbors) game.blocked[id] = game.turn + 10;
  assert.equal(game.roll(), "asteroid");
});
