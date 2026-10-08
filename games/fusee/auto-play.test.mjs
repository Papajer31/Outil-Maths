import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('./auto-play.js', import.meta.url), 'utf8');
const { createInactivityController, chooseAutomaticResource, chooseAutomaticMove } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const context = vm.createContext({});
vm.runInContext(await readFile(new URL('./engine.js', import.meta.url), 'utf8'), context);
const { Game, KEYS, PLANETS } = context.FuseeEngine;
const appSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const automaticActionSource = appSource.slice(appSource.indexOf('function getAutomaticGameAction(){'), appSource.indexOf('function moveShuttle('));

function createGame(playerCount = 3, rng = Math.random) {
  return new Game({
    players: Array.from({ length: playerCount }, (_, i) => 'Joueur ' + i),
    duration: 20, dust: 3,
    targets: Object.fromEntries(KEYS.map(key => [key, 5])),
    activities: Object.fromEntries(KEYS.map(key => [key, { level: 3, snapshot: { config_json: { tool_id: 'quiz' } } }]))
  }, rng);
}

function clock() {
  let now = 0, next = 0;
  const timers = new Map();
  return {
    schedule(fn, ms) { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; },
    unschedule(id) { timers.delete(id); },
    advance(ms) {
      const until = now + ms;
      while (true) {
        const first = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!first || first[1].at > until) break;
        now = first[1].at;
        timers.delete(first[0]);
        first[1].fn();
      }
      now = until;
    },
    get size() { return timers.size; }
  };
}

test('quatre secondes par action ; interactions et étapes relancent le délai', () => {
  const time = clock(), owner = {}, calls = [];
  let step = 'roll';
  const controller = createInactivityController(() => step && ({ owner, key: step, run() { calls.push(step); step = 'die'; } }), time);
  controller.refresh(); time.advance(3999); assert.deepEqual(calls, []);
  controller.refresh(); time.advance(1); assert.deepEqual(calls, ['roll']);
  time.advance(3000); controller.touch(); time.advance(3999); assert.equal(calls.length, 1);
  time.advance(1); assert.equal(calls.length, 2);
  step = 'move'; controller.refresh(); time.advance(3999); assert.equal(calls.length, 2);
  time.advance(1); assert.equal(calls.at(-1), 'move');
  controller.cancel(); assert.equal(time.size, 0);
});

test('une action périmée, une animation, la pause ou une autre partie ne sont pas exécutées', () => {
  for (const reason of ['busy', 'phase', 'owner']) {
    const time = clock(); let calls = 0, busy = false, owner = {}, key = 'move';
    const controller = createInactivityController(() => busy ? null : ({ owner, key, run() { calls++; busy = true; } }), time);
    controller.refresh(); time.advance(3000);
    if (reason === 'busy') busy = true;
    if (reason === 'phase') key = 'notice';
    if (reason === 'owner') owner = {};
    time.advance(1000); assert.equal(calls, 0);
    busy = false; controller.refresh(); time.advance(3999); assert.equal(calls, 0);
    time.advance(1); assert.equal(calls, 1);
  }
});

test('un délai modifié annule le compte à rebours précédent et utilise la nouvelle valeur', () => {
  const time = clock(), owner = {};
  let delay = 10000, calls = 0, available = true;
  const controller = createInactivityController(() => available && ({ owner, key: 'roll', run() { calls++; available = false; } }), { ...time, delayMs: () => delay });
  controller.refresh(); time.advance(3000); delay = 2000; controller.refresh();
  time.advance(1999); assert.equal(calls, 0); time.advance(1); assert.equal(calls, 1);
  assert.equal(time.size, 0);
});

test('désactiver annule une action en attente ; réactiver donne un délai complet', () => {
  const time = clock(), owner = {};
  let enabled = true, calls = 0;
  const controller = createInactivityController(() => enabled && ({ owner, key: 'roll', run() { calls++; enabled = false; } }), { ...time, delayMs: () => 7000 });
  controller.refresh(); time.advance(6000); enabled = false; controller.touch();
  time.advance(30000); assert.equal(calls, 0); assert.equal(time.size, 0);
  enabled = true; controller.touch(); time.advance(6999); assert.equal(calls, 0);
  time.advance(1); assert.equal(calls, 1);
});

test('réglages sauvegardés dans la préparation et la partie ; anciennes configurations compatibles', () => {
  const game = createGame(), saved = [];
  let saves = 0, touches = 0;
  const ctx = vm.createContext({ game, config: createGame().config,
    document: { querySelector: () => null }, inactivity: { touch() { touches++; } },
    saveConfig() { saved.push(JSON.parse(JSON.stringify(ctx.config))); }, saveGame() { saves++; }
  });
  vm.runInContext(appSource.slice(appSource.indexOf('function getInactivitySettings('), appSource.indexOf('function getAutomaticGameAction(){')), ctx);
  const settings = value => JSON.parse(JSON.stringify(ctx.getInactivitySettings(value)));
  assert.deepEqual(settings({}), { enabled: true, seconds: 4 });
  assert.equal(settings({ inactivitySeconds: 'incorrect' }).seconds, 4);
  assert.equal(settings({ inactivitySeconds: 500 }).seconds, 120);
  assert.equal(settings({ inactivitySeconds: 1 }).seconds, 1);
  ctx.updateInactivitySetting('setup', 'automaticControlEnabled', false);
  ctx.updateInactivitySetting('setup', 'inactivitySeconds', 12);
  assert.equal(saved.at(-1).automaticControlEnabled, false); assert.equal(saved.at(-1).inactivitySeconds, 12);
  assert.equal(saves, 0); assert.equal(game.config.automaticControlEnabled, undefined);
  ctx.updateInactivitySetting('game', 'automaticControlEnabled', false);
  ctx.updateInactivitySetting('game', 'inactivitySeconds', 9);
  const restored = Game.restore(game.snapshot());
  assert.deepEqual(settings(restored.config), { enabled: false, seconds: 9 });
  assert.equal(saves, 2); assert.equal(touches, 4);
});

test('le contrôleur du jeu couvre le dé, les déplacements, la question préparée et les notices', () => {
  const game = createGame(), calls = [], buttons = new Set();
  const ctx = vm.createContext({
    RUNTIME_MODE: true, game, paused: false, depositView: null, dieReady: false, notice: null,
    shuttleMotion: { isIdle: () => true },
    document: { hidden: false, querySelector(selector) { const m=selector.match(/data-action="([^"]+)"/); return !!m && buttons.has(m[1]); } },
    chooseAutomaticMove, chooseAutomaticResource,
    acceptDie: () => calls.push('accept-die'), rollDie: () => calls.push('roll'),
    moveShuttle: node => calls.push('move:' + node), chooseResource: key => calls.push('resource:' + key),
    continueNotice: () => calls.push('continue')
  });
  vm.runInContext(automaticActionSource, ctx);
  const action = () => ctx.getAutomaticGameAction();
  action().run(); assert.equal(calls.at(-1), 'roll');
  game.phase = 'die'; assert.equal(action(), null);
  ctx.dieReady = true; buttons.add('accept-die'); action().run(); assert.equal(calls.at(-1), 'accept-die');
  game.die = 3; game.acceptRoll(); action().run(); assert.match(calls.at(-1), /^move:/);
  game.phase = 'resource'; game.pendingResource = 'carburant'; assert.equal(action(), null);
  buttons.add('resource-carburant'); action().run(); assert.equal(calls.at(-1), 'resource:carburant');
  game.phase = 'notice'; ctx.notice = { type: 'next' }; buttons.add('roll');
  action().run(); assert.equal(calls.at(-1), 'roll');
  for (const type of ['event', 'answer', 'deposit']) {
    ctx.notice = { type }; buttons.add('continue'); action().run(); assert.equal(calls.at(-1), 'continue');
  }
  game.phase = 'arrive'; ctx.notice = { type: 'event' }; action().run(); assert.equal(calls.at(-1), 'continue');
  ctx.notice = null; assert.equal(action(), null);
  game.phase = 'roll';
  game.config.automaticControlEnabled = false; assert.equal(action(), null);
  game.config.automaticControlEnabled = true; assert.ok(action());
  for (const flag of ['paused', 'depositView']) {
    ctx[flag] = true; assert.equal(action(), null); ctx[flag] = null;
  }
  ctx.document.hidden = true; assert.equal(action(), null); ctx.document.hidden = false;
  ctx.shuttleMotion.isIdle = () => false; assert.equal(action(), null); ctx.shuttleMotion.isIdle = () => true;
  game.missionStarted = false; assert.equal(action(), null); game.missionStarted = true;
  ctx.RUNTIME_MODE = false; assert.equal(action(), null); ctx.RUNTIME_MODE = true;
  game.phase = 'won'; assert.equal(action(), null);
  game.phase = 'question'; assert.equal(action(), null);
});

test('le passage automatique du choix de ressource à la question arrête le délai', () => {
  const time = clock(), game = createGame(); game.phase = 'resource';
  const ctx = vm.createContext({
    RUNTIME_MODE: true, game, paused: false, depositView: null, notice: null, shuttleMotion: null,
    document: { hidden: false, querySelector: selector => selector.includes('resource-carburant') }, chooseAutomaticResource,
    chooseResource: key => game.questionFor(key)
  });
  vm.runInContext(automaticActionSource, ctx);
  const controller = createInactivityController(() => ctx.getAutomaticGameAction(), time);
  controller.refresh(); time.advance(4000);
  assert.equal(game.phase, 'question'); assert.equal(time.size, 0);
  time.advance(60000); assert.equal(game.phase, 'question'); assert.equal(game.players[0].successes, 0);
});

test('les six planètes sont fixes et la question est toujours pour l’élève actif', () => {
  const game = createGame(4, () => 0);
  assert.equal(Object.values(game.board.nodes).filter(node => node.type === 'planet').length, 6);
  assert.equal(JSON.stringify(PLANETS.map(p => [p.key, p.asset])), JSON.stringify([
    ['eau','Pla1.png'], ['oxygene','Pla2.png'], ['carburant','Pla3.png'],
    ['provisions','Pla4.png'], ['merchant','Pla5.png'], ['outils','Pla6.png']
  ]));
  game.active = 2;
  game.players[0].questions = 4;
  game.players[1].questions = 2;
  game.players[2].questions = 3;
  game.players[3].questions = 2;
  game.position = 'p0'; game.phase = 'arrive';
  const result = game.resolve();
  assert.equal(result.type, 'planet'); assert.equal(result.resource, 'eau');
  assert.equal(result.player, 2); assert.equal(game.phase, 'resource');
  game.questionFor('eau');
  assert.equal(game.question.player, 2); assert.equal(game.players[2].questions, 4);
  game.resolveQuestion(true);
  assert.equal(game.players[2].bag.eau, 1);
  assert.ok([1,3].includes(game.active));
});

test('le joueur actif ne change jamais sur un tour sans question', () => {
  const game = createGame(4, () => 0.75);
  game.active = 2;
  game.consecutiveRolls = 12;
  game.rollsSinceQuestion = 4;
  game.position = 'b0_1'; game.phase = 'arrive';
  const result = game.resolve();
  assert.equal(result.type, 'next');
  assert.equal(game.active, 2);
  game.continue();
  assert.equal(game.phase, 'roll');
  assert.equal(game.active, 2);
});

test('après chaque question, le prochain élève est tiré au hasard parmi les moins sollicités', () => {
  const game = createGame(4, () => 0.6);
  game.active = 0;

  const answer = () => {
    const answering = game.active;
    game.phase = 'resource';
    game.pendingResource = 'eau';
    game.questionFor('eau');
    assert.equal(game.question.player, answering);
    game.resolveQuestion(true);
    assert.notEqual(game.active, answering);
    return [answering, game.active];
  };

  assert.deepEqual(answer(), [0, 2]);
  assert.deepEqual(answer(), [2, 3]);
  assert.deepEqual(answer(), [3, 1]);
  assert.deepEqual(game.players.map(p => p.questions), [1, 0, 1, 1]);
  assert.equal(game.active, 1);

  answer();
  assert.deepEqual(game.players.map(p => p.questions), [1, 1, 1, 1]);
  assert.ok([0,2,3].includes(game.active));
  assert.ok(Math.max(...game.players.map(p => p.questions)) - Math.min(...game.players.map(p => p.questions)) <= 1);
});

test('au deuxième tour sans question, le dé privilégie un nombre donnant accès à la fois à une planète et un événement', () => {
  const game = createGame(4);
  game.position = 'r0_1'; game.phase = 'roll'; game.rollsSinceQuestion = 1;
  const die = game.roll();
  assert.ok([3, 5].includes(die));
  const kinds = game.arrivalKinds(die);
  assert.equal(kinds.has('planet'), true); assert.equal(kinds.has('asteroid'), true);
  assert.equal(game.log.at(-1).policy, 'cadence-both');
});

test('au deuxième tour, faute de nombre planète + événement, le dé privilégie planète OU événement', () => {
  const game = createGame(4);
  game.position = 'c'; game.phase = 'roll'; game.rollsSinceQuestion = 1;
  const die = game.roll();
  assert.ok([3, 5].includes(die));
  const kinds = game.arrivalKinds(die);
  assert.equal(kinds.has('planet') || kinds.has('asteroid'), true);
  assert.equal(game.log.at(-1).policy, 'cadence-either');
});

test('au troisième tour, le dé garde un nombre planète + événement s’il existe, sinon force la face événement', () => {
  const withChoice = createGame(4);
  withChoice.position = 'r0_1'; withChoice.phase = 'roll'; withChoice.rollsSinceQuestion = 2;
  const numeric = withChoice.roll();
  assert.ok([3, 5].includes(numeric));
  assert.equal(withChoice.log.at(-1).policy, 'cadence-both');

  const fallback = createGame(4);
  fallback.position = 'c'; fallback.phase = 'roll'; fallback.rollsSinceQuestion = 2;
  assert.equal(fallback.roll(), 'asteroid');
  assert.equal(fallback.log.at(-1).policy, 'cadence-event');
});

test('une case neutre reste neutre même après trois tours sans question', () => {
  const game = createGame(4);
  game.rollsSinceQuestion = 3;
  game.position = 'b0_1'; game.phase = 'arrive';
  const result = game.resolve();
  assert.equal(result.type, 'next'); assert.equal(game.phase, 'notice');
  assert.equal(game.pendingResource, null); assert.equal(game.pendingQuestionEvent, null);
});

test('une case événement peut convertir la cadence en question à partir du deuxième tour', () => {
  const game = createGame(4);
  game.rollsSinceQuestion = 2;
  game.position = 'r0_2'; game.phase = 'arrive';
  const result = game.resolve();
  assert.equal(result.type, 'questionEvent'); assert.equal(game.phase, 'resource');
  assert.ok(KEYS.includes(result.resource));
});

test('la planète marchande choisit la ressource la plus utile à la mission', () => {
  const game = createGame(4);
  for (const key of KEYS) game.stock[key] = game.config.targets[key];
  game.stock.outils = 0;
  game.position = 'p4'; game.phase = 'arrive';
  const result = game.resolve();
  assert.equal(result.type, 'planet'); assert.equal(result.merchant, true); assert.equal(result.resource, 'outils');
});

test('la ressource choisie tient compte des objectifs, des sacs et des activités disponibles', () => {
  const game = createGame();
  game.stock.carburant = 5;
  game.players[1].bag.eau = 5;
  game.config.targets.provisions = 0;
  game.config.activities.outils = null;
  assert.equal(chooseAutomaticResource(game), 'oxygene');
  game.config.activities.oxygene = null;
  assert.ok(['carburant', 'eau'].includes(chooseAutomaticResource(game)));
  for (const key of KEYS) game.config.activities[key] = null;
  assert.equal(chooseAutomaticResource(game), null);
});

test('un sac chargé privilégie le centre et reprend le même lancer après le ravitaillement', () => {
  const game = createGame(); game.position = 'b0_1'; game.phase = 'die'; game.die = 2;
  game.players[0].bag.eau = 2; game.acceptRoll();
  assert.equal(chooseAutomaticMove(game), 'c'); game.move('c');
  assert.equal(game.resolve().type, 'deposit'); assert.equal(game.remaining, 1);
  game.continue(); assert.equal(game.active, 0); assert.equal(game.phase, 'move');
  const next = chooseAutomaticMove(game); assert.ok(game.options().includes(next));
  assert.notEqual(next, 'b0_1'); game.move(next); assert.equal(game.remaining, 0);
});

test('sans ressource portée, un trajet atteignant une planète est préféré', () => {
  const game = createGame(); game.phase = 'die'; game.die = 3; game.acceptRoll();
  while (game.phase === 'move') game.move(chooseAutomaticMove(game));
  assert.equal(game.board.nodes[game.position].type, 'planet');
});

test('les décisions respectent les chemins autorisés et les planètes bloquées de 2 à 8 joueurs', () => {
  for (let count = 2; count <= 8; count++) {
    const game = createGame(count); game.blocked.p1 = 100;
    for (const position of Object.keys(game.board.nodes)) {
      if (game.blocked[position]) continue;
      for (const steps of [2, 3, 4, 5]) {
        if (!game.canFinish(position, steps, [position])) continue;
        game.position = position; game.remaining = steps; game.visited = [position]; game.phase = 'move';
        let moves = 0;
        while (game.phase === 'move') {
          const next = chooseAutomaticMove(game);
          assert.ok(game.options().includes(next)); assert.ok(!game.blocked[next]);
          game.move(next); moves++; assert.ok(moves <= steps);
          if (game.phase === 'arrive' && game.remaining > 0) { game.resolve(); game.continue(); }
        }
        assert.equal(game.remaining, 0);
      }
    }
  }
});
