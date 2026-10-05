import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const context = vm.createContext({});
vm.runInContext(await fs.readFile(new URL('../../games/fusee/engine.js', import.meta.url), 'utf8'), context);
const { Game, KEYS } = context.FuseeEngine;

for (const kind of ['transport', 'return']) {
  test(`Le voyage ${kind} attend la confirmation, même après une sauvegarde`, () => {
    let game = new Game({
      players:['Léa', 'Noah'], duration:30, dust:3,
      targets:Object.fromEntries(KEYS.map(key => [key, key === 'eau' ? 3 : 0])),
      activities:{ eau:{ snapshot:{ config_json:{ tool_id:'addition' } } } }
    });
    game.position = 'r0_2';
    game.phase = 'arrive';
    game.players[0].bag.eau = 2;
    game.pickEvent = () => ({ kind, player:1, story:0 });
    assert.equal(game.resolve().type, 'event');
    assert.equal(game.position, 'r0_2');
    assert.equal(game.phase, 'notice');
    assert.equal(game.active, 0);
    game = Game.restore(game.snapshot());
    assert.equal(game.position, 'r0_2');
    assert.equal(game.players[0].bag.eau, 2);
    game.continue();
    assert.equal(game.position, kind === 'transport' ? 'p1' : 'c');
    assert.equal(game.phase, 'arrive');
    assert.equal(game.active, 0, 'Le voyage ne change pas de joueur avant l’arrivée.');
    assert.equal(game.pendingTravel, null);
    const arrival = game.resolve();
    assert.equal(arrival.type, kind === 'transport' ? 'planet' : 'deposit');
    if (kind === 'transport') assert.equal(game.active, 1);
    else assert.equal(game.stock.eau, 2);
  });
}
