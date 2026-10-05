// Run: node --test --test-isolation=none _dev/regression-tests/fusee-interactions.test.mjs
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../responsive-audit/node_modules/playwright/index.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const screenshots = path.join(os.tmpdir(), "portail-fusee-interactions");
let server, browser, baseUrl;
const mime = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".mp3":"audio/mpeg", ".wav":"audio/wav", ".flac":"audio/flac", ".ttf":"font/ttf" };

before(async () => {
  await fs.mkdir(screenshots, { recursive:true });
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = path.resolve(root, `.${decodeURIComponent(pathname === "/games/fusee/" ? `${pathname}index.html` : pathname)}`);
    if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
    try {
      let content = await fs.readFile(file);
      // Authentication and teacher records are isolated fixtures; the game,
      // session imports, styles and media are the actual project files.
      if (pathname === "/games/fusee/") {
        content = content.toString().replace(/<script src="https:\/\/cdn[^>]+><\/script>/, '<script>window.supabase={createClient:()=>({})};</script>');
      } else if (pathname === "/games/fusee/app.js") {
        content = content.toString().replace(/^import .*teacher-api.js";/m, `
          const getCurrentUser = async () => ({ id:'test-teacher' });
          const getMyTeacherSpace = async () => ({ id:'test-space', access_code:'TEST' });
          const listTeacherActivitiesForSpace = async () => [];
        `);
      }
      response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true });
});

after(async () => {
  await browser?.close();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
});

async function startGame(options = {}, players = ['Léa', 'Noah']) {
  const context = await browser.newContext({ viewport:{ width:1440, height:900 }, ...options });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.audioEvents = [];
    window.speechCalls = [];
    window.speechSynthesis.speak = () => window.speechCalls.push('speak');
    window.speechSynthesis.cancel = () => window.speechCalls.push('cancel');
    window.SpeechSynthesisUtterance = class {
      constructor() { window.speechCalls.push('utterance'); }
    };
    window.Audio = class {
      constructor(src) { this.src = src; this.paused = true; this.ended = false; this.currentTime = 0; }
      load() {}
      play() { this.paused = false; this.ended = false; window.audioEvents.push({ kind:'play', src:this.src }); return Promise.resolve(); }
      pause() { this.paused = true; window.audioEvents.push({ kind:'pause', src:this.src }); }
    };
  });
  await page.goto(`${baseUrl}/games/fusee/`);
  await page.getByRole("button", { name:"Commencer la mission", exact:true }).waitFor();
  await page.evaluate(players => {
    document.documentElement.requestFullscreen = async () => {};
    const config = window.FuseeApp.getConfig();
    config.players = players;
    for (const key of window.FuseeEngine.KEYS) {
      config.activities[key] = { id:'addition', title:'Addition', level:3, snapshot:{ activity_type:'tool', config_json:{ tool_id:'addition', level:{ settings:{} } } } };
    }
    window.FuseeApp.setConfig(config);
  }, players);
  await page.getByRole("button", { name:"Commencer la mission", exact:true }).click();
  await page.getByRole("button", { name:"Démarrer la mission", exact:true }).click({ timeout:20000 });
  return { context, page };
}

async function openAlphabetQuestion(page) {
  await page.evaluate(() => {
    const game = window.FuseeApp.getGame();
    game.config.activities.eau = {
      id:'alphabet-series', title:'Question avec clavier alphabétique', level:3,
      snapshot:{ activity_type:'series', config_json:{ tool_id:'quiz', level:{ settings:{
        quizSnapshot:{ editorMode:'series', seriesModelId:'alphabet', questions:[{
          id:'alphabet', widgets:[
            { id:'prompt', type:'text', questionText:'Écris le mot chat', column:1, row:1, columnSpan:12, rowSpan:4 },
            { id:'answer', type:'answer', correctionText:'chat', correctionOverrides:{ text:true }, column:3, row:6, columnSpan:8, rowSpan:1 },
            { id:'keyboard', type:'alphabet-keyboard', column:1, row:7, columnSpan:12, rowSpan:2, visibility:'question' }
          ], variants:[{ id:'chat', widgets:[{ id:'prompt', questionText:'Écris le mot chat' }, { id:'answer', correctionText:'chat', correctionTextOverridden:true }] }]
        }] }, questionSelection:{ mode:'all' }
      } } } }
    };
    game.phase = 'resource';
    game.position = 'p0';
    game.active = 0;
    // Enter the actual question handler from this deterministic game state.
    const trigger = document.createElement('button');
    trigger.dataset.action = 'resource-eau';
    document.body.append(trigger);
    trigger.click();
    trigger.remove();
  });
  await page.locator('[data-quiz-runtime-answer-input]').waitFor();
}

test('La saisie alphabétique garde le même champ et un focus stable, sans cadre bleu intérieur', async () => {
  const { context, page } = await startGame({ hasTouch:true });
  try {
    await openAlphabetQuestion(page);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const input = document.querySelector('[data-quiz-runtime-answer-input]');
      window.originalAnswerInput = input;
      window.inputFocusEvents = [];
      input.addEventListener('focus', () => window.inputFocusEvents.push('focus'));
      input.addEventListener('blur', () => window.inputFocusEvents.push('blur'));
      window.answerMutations = [];
      new MutationObserver(mutations => window.answerMutations.push(...mutations.map(m => ({ type:m.type, target:m.target.className })))).observe(document.querySelector('.quiz-runtime-root'), { childList:true, subtree:true });
    });
    assert.equal(await page.locator('[data-quiz-runtime-answer-input]').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    for (const letter of ['c', 'h', 'a', 't']) await page.locator(`[data-quiz-runtime-alphabet-key="${letter}"]`).click();
    const state = await page.evaluate(() => {
      const input = document.querySelector('[data-quiz-runtime-answer-input]');
      return { same:input === window.originalAnswerInput, value:input.value, focusEvents:window.inputFocusEvents,
        mutations:window.answerMutations, focused:document.activeElement === input };
    });
    assert.equal(state.same, true);
    assert.equal(state.value, 'chat');
    assert.equal(state.focused, true);
    assert.deepEqual(state.focusEvents, []);
    assert.deepEqual(state.mutations, []);
    await page.locator('[data-quiz-runtime-alphabet-key="backspace"]').click();
    assert.equal(await page.locator('[data-quiz-runtime-answer-input]').inputValue(), 'cha');
    await page.locator('[data-tool-alphabet-drawer-toggle]').first().click();
    await page.locator('[data-quiz-runtime-alphabet-key="à"]').click();
    assert.equal(await page.locator('[data-quiz-runtime-answer-input]').inputValue(), 'chaà');
    assert.deepEqual(await page.evaluate(() => window.inputFocusEvents), []);
    await page.locator('[data-quiz-runtime-answer-input]').press('Backspace');
    await page.locator('[data-quiz-runtime-alphabet-key="t"]').tap();
    assert.equal(await page.locator('[data-quiz-runtime-answer-input]').inputValue(), 'chat');
    assert.deepEqual(await page.evaluate(() => window.inputFocusEvents), []);
    await page.locator('[data-quiz-runtime-answer-input]').press('Backspace');
    await page.locator('[data-quiz-runtime-answer-input]').press('t');
    assert.equal(await page.locator('[data-quiz-runtime-answer-input]').inputValue(), 'chat');
    await page.screenshot({ path:path.join(screenshots, 'alphabet-stable.png') });
    await page.getByRole('button', { name:'Valider', exact:true }).click();
    await page.locator('.quiz-runtime-answer-box--display.is-correct').waitFor();
    await page.getByRole('button', { name:"Fin de l'activité", exact:true }).click();
    await page.getByRole('heading', { name:'Ressource récupérée !', exact:true }).waitFor();
    assert.equal(await page.evaluate(() => window.FuseeApp.getGame().players[0].bag.eau), 1);
    assert.equal(await page.evaluate(() => window.audioEvents.filter(e => e.kind === 'play' && e.src.endsWith('collect.wav')).length), 1);
    assert.deepEqual(await page.evaluate(() => window.speechCalls), []);
  } finally { await context.close(); }
});

test('Le bouton Poudre d’étoile est visible en bas à gauche et ouvre l’aide', async () => {
  const { context, page } = await startGame();
  try {
    await openAlphabetQuestion(page);
    for (const viewport of [{ width:1440, height:900 }, { width:700, height:900 }, { width:390, height:844 }]) {
      await page.setViewportSize(viewport);
      const geometry = await page.locator('.fusee-dust-btn').evaluate(el => {
        const rect = el.getBoundingClientRect(), validate = document.querySelector('#btnManualAction').getBoundingClientRect();
        return { x:rect.x, bottom:innerHeight - rect.bottom, height:rect.height, width:rect.width,
          fontSize:parseFloat(getComputedStyle(el).fontSize), overlaps:rect.right > validate.left && rect.left < validate.right && rect.bottom > validate.top && rect.top < validate.bottom };
      });
      assert.ok(geometry.x >= 8 && geometry.x <= 24, JSON.stringify(geometry));
      assert.ok(geometry.bottom >= 8 && geometry.bottom <= 24, JSON.stringify(geometry));
      assert.ok(geometry.height >= 60 && geometry.fontSize >= 16, JSON.stringify(geometry));
      assert.equal(geometry.overlaps, false, JSON.stringify(geometry));
      await page.screenshot({ path:path.join(screenshots, `powder-${viewport.width}.png`) });
    }
    await page.getByRole('button', { name:'Poudre d’étoile', exact:true }).click();
    await page.getByRole('heading', { name:'Qui viens-tu appeler ?', exact:true }).waitFor();
    await page.getByRole('button', { name:'Noah', exact:true }).click();
    assert.equal(await page.evaluate(() => window.FuseeApp.getGame().dust), 2);
    assert.equal(await page.locator('.fusee-dust-btn').isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.speechCalls), []);
  } finally { await context.close(); }
});

for (const { reducedMotion, point } of [
  { reducedMotion:'no-preference', point:{ x:20, y:20 } },
  { reducedMotion:'no-preference', point:{ x:900, y:300 } },
  { reducedMotion:'reduce', point:{ x:1400, y:870 } }
]) {
  test(`Le dé pulse en continu et se valide ailleurs sur l’écran (${reducedMotion}, ${point.x}/${point.y})`, async () => {
    const { context, page } = await startGame({ reducedMotion });
    try {
      await page.evaluate(() => { window.FuseeApp.getGame().rng = () => 0.4; });
      await page.getByRole('button', { name:'Lancer le dé', exact:true }).last().click();
      await page.mouse.click(point.x, point.y);
      assert.equal(await page.locator('#die-confirm').isDisabled(), true);
      await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
      const animation = await page.locator('#die-confirm').evaluate(el => {
        const style = getComputedStyle(el);
        return { name:style.animationName, iterations:style.animationIterationCount, transform:style.transform };
      });
      assert.equal(animation.name, 'die-confirm-pulse');
      assert.equal(animation.iterations, 'infinite');
      await page.waitForTimeout(2500);
      assert.ok(await page.locator('#die-confirm').evaluate(el => el.getAnimations().some(a => a.playState === 'running')));
      const transform = await page.locator('#die-confirm').evaluate(el => getComputedStyle(el).transform);
      await page.waitForTimeout(300);
      assert.notEqual(await page.locator('#die-confirm').evaluate(el => getComputedStyle(el).transform), transform);
      await page.mouse.click(point.x, point.y);
      assert.equal(await page.locator('#die-confirm').count(), 0);
      const game = await page.evaluate(() => ({ phase:window.FuseeApp.getGame().phase, visited:window.FuseeApp.getGame().visited }));
      assert.equal(game.phase, 'move');
      assert.deepEqual(game.visited, ['c'], 'Le clic de validation ne doit pas agir aussi sur le plateau.');
    } finally { await context.close(); }
  });
}

for (const kind of ['transport', 'return']) {
  test(`Le voyage ${kind} démarre au clic Continuer et attend son arrivée`, async () => {
    const { context, page } = await startGame();
    try {
      await page.evaluate(kind => {
        const game = window.FuseeApp.getGame();
        game.position = 'r0_2';
        game.players[0].bag.eau = 2;
        game.rng = () => 0.999;
        game.pickEvent = () => ({ kind, player:1, story:0 });
        dispatchEvent(new Event('resize'));
      }, kind);
      await page.waitForFunction(() => document.querySelector('.shuttle').dataset.motion === 'idle');
      await page.getByRole('button', { name:'Lancer le dé', exact:true }).last().click();
      await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
      await page.evaluate(() => { window.audioEvents = []; });
      await page.locator('#die-confirm').click({ force:true });
      await page.getByRole('button', { name:'Continuer', exact:true }).waitFor();
      const origin = await page.locator('.shuttle').evaluate(el => getComputedStyle(el).transform);
      await page.waitForTimeout(1100);
      assert.equal(await page.locator('.shuttle').evaluate(el => getComputedStyle(el).transform), origin);
      assert.equal(await page.evaluate(() => window.FuseeApp.getGame().position), 'r0_2');
      assert.equal(await page.evaluate(() => window.audioEvents.filter(e => e.src.endsWith('navette.flac')).length), 0);
      // A fresh runtime restores the pending trip at its origin, with the event still open.
      await page.reload();
      await page.getByRole('button', { name:'Commencer la mission', exact:true }).waitFor();
      await page.evaluate(() => window.FuseeApp.resume());
      await page.getByRole('button', { name:'Continuer', exact:true }).waitFor();
      assert.equal(await page.evaluate(() => window.FuseeApp.getGame().position), 'r0_2');
      assert.equal(await page.locator('.shuttle').getAttribute('data-motion'), 'idle');
      await page.getByRole('button', { name:'Continuer', exact:true }).click();
      await page.waitForFunction(() => document.querySelector('.shuttle').dataset.motion === 'moving');
      assert.equal(await page.locator('.modal').count(), 0, 'Le message doit se fermer avant le voyage.');
      assert.equal(await page.evaluate(() => window.FuseeApp.getGame().phase), 'arrive');
      assert.equal(await page.evaluate(() => window.FuseeApp.getGame().players[0].bag.eau), 2);
      await page.waitForFunction(() => document.querySelector('.shuttle').dataset.motion === 'idle');
      if (kind === 'transport') {
        await page.locator('.resource-modal').waitFor();
        assert.equal(await page.evaluate(() => window.FuseeApp.getGame().active), 1);
      } else {
        await page.locator('.resource-flight').waitFor();
        assert.equal(await page.evaluate(() => window.FuseeApp.getGame().stock.eau), 2);
      }
    } finally { await context.close(); }
  });
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`Le transfert des sacs reste visible six secondes (${reducedMotion})`, async () => {
    const { context, page } = await startGame({ reducedMotion });
    try {
      await page.evaluate(() => {
        const game = window.FuseeApp.getGame();
        game.players[0].bag.eau = 2;
        game.rng = () => 0;
      });
      await page.getByRole('button', { name:'Lancer le dé', exact:true }).last().click();
      await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
      await page.locator('#die-confirm').click({ force:true });
      await page.locator('.resource-flight').waitFor();
      const source = await page.locator('.resource-flight').evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { x:rect.x, y:rect.y, duration:getComputedStyle(el).animationDuration };
      });
      assert.equal(source.duration, '6s');
      assert.equal(await page.locator('#bag-0-eau b').textContent(), '2');
      await page.waitForTimeout(3000);
      const halfway = await page.locator('.resource-flight').evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { x:rect.x, y:rect.y, opacity:getComputedStyle(el).opacity };
      });
      assert.ok(Math.hypot(halfway.x - source.x, halfway.y - source.y) > 30);
      assert.ok(Number(halfway.opacity) > 0.9);
      assert.equal(await page.locator('#bag-0-eau b').textContent(), '2');
      await page.locator('.resource-flight').waitFor({ state:'detached' });
      assert.equal(await page.locator('#bag-0-eau b').textContent(), '0');
      assert.equal(await page.locator('#gauge-eau b').textContent(), '2/3');
      await page.locator('.deposit-modal').waitFor();
    } finally { await context.close(); }
  });
}

test("Les images sont centrées et l'annonce du prochain joueur reste concise", async () => {
  const { context, page } = await startGame();
  try {
    for (const viewport of [{ width:1440, height:900 }, { width:700, height:900 }]) {
      await page.setViewportSize(viewport);
      const centers = await page.evaluate(() => {
        const image = document.querySelector('.notice-art').getBoundingClientRect();
        const modal = document.querySelector('.modal').getBoundingClientRect();
        return { image:image.left + image.width / 2, modal:modal.left + modal.width / 2 };
      });
      assert.ok(Math.abs(centers.image - centers.modal) < 1, JSON.stringify(centers));
      const footer = await page.evaluate(() => {
        const die = document.querySelector('.turn-panel .die').getBoundingClientRect();
        const bags = document.querySelector('.crew-bags').getBoundingClientRect();
        return { dieLeft:die.left, dieRight:die.right, bagsRight:bags.right, viewport:innerWidth };
      });
      assert.ok(footer.dieLeft > footer.bagsRight, 'Le petit dé doit être à droite des sacs.');
      assert.ok(footer.viewport - footer.dieRight <= 20, 'Le petit dé doit se trouver au bord droit du bandeau.');
    }
    assert.equal(await page.locator('.notice-text').count(), 0);
    assert.doesNotMatch(await page.locator('.modal').innerText(), /viens lancer|continuer le voyage/i);
    await page.screenshot({ path:path.join(screenshots, 'notice-centered.png') });
  } finally { await context.close(); }
});

test("Les six faces défilent rapidement et les déplacements acceptent des clics rapides", async () => {
  const { context, page } = await startGame();
  try {
    await page.evaluate(() => { window.FuseeApp.getGame().rng = () => 0.4; });
    await page.getByRole("button", { name:"Lancer le dé", exact:true }).last().click();
    await page.evaluate(() => {
      const face = document.querySelector('.die-shuffle');
      const sample = () => ({ face:face.dataset.face, time:performance.now(), imageLoaded:!face.querySelector('img') || face.querySelector('img').naturalWidth > 0,
        footerText:document.querySelector('.turn-panel .die').textContent.trim(), footerLabel:document.querySelector('.turn-panel .die').getAttribute('aria-label') });
      window.dieSamples = [sample()];
      new MutationObserver(() => window.dieSamples.push(sample())).observe(face, { childList:true });
    });
    await page.waitForTimeout(350);
    const face = await page.locator('.die-shuffle').evaluate(el => {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      return { display:style.display, transform:style.transform, width:rect.width, height:rect.height, face:el.dataset.face };
    });
    assert.equal(face.display, 'flex');
    assert.equal(face.transform, 'none');
    assert.ok(face.width >= 190 && face.height >= 190);
    assert.match(face.face, /^(rocket|asteroid|[2-5])$/);
    await page.screenshot({ path:path.join(screenshots, 'dice-shuffle.png') });
    await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
    const samples = await page.evaluate(() => window.dieSamples);
    assert.ok(samples.every(sample => sample.footerText === '…' && sample.footerLabel === 'Lancer en cours'), 'Le petit dé ne doit pas révéler le résultat pendant le défilement.');
    assert.equal((await page.locator('.turn-panel .die').textContent()).trim(), '3');
    assert.equal(await page.locator('.turn-panel .die').getAttribute('aria-label'), 'Résultat du dé : 3');
    assert.ok(samples.length >= 20, `${samples.length} faces affichées`);
    assert.deepEqual([...new Set(samples.map(sample => sample.face))].sort(), ['2', '3', '4', '5', 'asteroid', 'rocket']);
    assert.ok(samples.every(sample => sample.imageLoaded), 'Les images de la fusée et de l’astéroïde doivent être chargées.');
    for (let index = 1; index < samples.length; index++) {
      assert.notEqual(samples[index].face, samples[index - 1].face);
    }
    const meanInterval = (samples.at(-1).time - samples[1].time) / (samples.length - 2);
    assert.ok(meanInterval >= 40 && meanInterval < 110, `${meanInterval} ms entre les faces`);
    await page.locator('#die-confirm').click({ force:true });
    const movement = await page.evaluate(() => {
      window.audioEvents = [];
      const started = performance.now();
      for (const node of ['b0_1', 'b0_2', 'p0']) document.querySelector(`[data-node="${node}"]`).click();
      const game = window.FuseeApp.getGame();
      return { elapsed:performance.now() - started, phase:game.phase, remaining:game.remaining, position:game.position };
    });
    assert.equal(movement.position, 'p0');
    assert.equal(movement.remaining, 0);
    assert.equal(movement.phase, 'arrive');
    assert.ok(movement.elapsed < 240);
    await page.locator('.resource-modal').waitFor();
    assert.equal(await page.locator('.resource-modal .note').count(), 0);
    const audio = await page.evaluate(() => window.audioEvents.filter(event => event.src.endsWith('navette.flac')));
    assert.deepEqual(audio.map(event => event.kind), ['play']);
    assert.equal(await page.evaluate(() => window.FuseeApp.getGame().phase), 'resource');
  } finally { await context.close(); }
});

test("Les faces défilent à l'écran même quand les animations sont réduites", async () => {
  const { context, page } = await startGame({ reducedMotion:'reduce' });
  try {
    await page.getByRole("button", { name:"Lancer le dé", exact:true }).last().click();
    const face = page.locator('.die-shuffle');
    assert.equal(await face.evaluate(el => getComputedStyle(el).display), 'flex');
    assert.equal(await face.evaluate(el => getComputedStyle(el).visibility), 'visible');
    assert.equal(await page.locator('.die-cube').evaluate(el => getComputedStyle(el).visibility), 'hidden');
    assert.equal(await page.locator('#die-confirm').evaluate(el => getComputedStyle(el).animationName), 'none');
    const firstImage = await face.screenshot({ path:path.join(screenshots, 'dice-reduced-first.png') });
    let secondImage = firstImage;
    for (let attempt = 0; attempt < 3 && firstImage.equals(secondImage); attempt++) {
      const currentFace = await face.getAttribute('data-face');
      assert.match(currentFace, /^(rocket|asteroid|[2-5])$/);
      await page.waitForFunction(value => document.querySelector('.die-shuffle')?.dataset.face !== value, currentFace);
      secondImage = await face.screenshot({ path:path.join(screenshots, 'dice-reduced-second.png') });
    }
    assert.notDeepEqual(firstImage, secondImage, 'La face doit réellement changer dans le rendu du navigateur.');
    await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
    assert.equal(await face.count(), 0);
    assert.equal(await page.locator('.die-cube').evaluate(el => getComputedStyle(el).visibility), 'visible');
  } finally { await context.close(); }
});

for (const [result, rng, label] of [['rocket', 0, 'Fusée'], ['asteroid', 0.999, 'Astéroïde']]) {
  test(`Le petit dé révèle ${label.toLowerCase()} seulement à la fin du défilement`, async () => {
    const { context, page } = await startGame();
    try {
      await page.evaluate(value => { window.FuseeApp.getGame().rng = () => value; }, rng);
      await page.getByRole('button', { name:'Lancer le dé', exact:true }).last().click();
      assert.equal(await page.evaluate(() => window.FuseeApp.getGame().die), result);
      assert.equal(await page.locator('.turn-panel .die img').count(), 0);
      assert.equal(await page.locator('.turn-panel .die').getAttribute('aria-label'), 'Lancer en cours');
      await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
      assert.equal(await page.locator('.turn-panel .die img').getAttribute('alt'), label);
      assert.equal(await page.locator('.turn-panel .die').getAttribute('aria-label'), label);
      for (const viewport of [{ width:1440, height:900 }, { width:700, height:900 }]) {
        await page.setViewportSize(viewport);
        const centers = await page.evaluate(() => {
          const image = document.querySelector('.turn-panel .die img').getBoundingClientRect();
          const die = document.querySelector('.turn-panel .die').getBoundingClientRect();
          return { dx:image.left + image.width / 2 - die.left - die.width / 2,
            dy:image.top + image.height / 2 - die.top - die.height / 2 };
        });
        assert.ok(Math.abs(centers.dx) < 1 && Math.abs(centers.dy) < 1, JSON.stringify(centers));
      }
      await page.locator('.turn-panel .die').screenshot({ path:path.join(screenshots, `small-die-${result}.png`) });
    } finally { await context.close(); }
  });
}

test("Les planètes utilisent d’ devant les prénoms concernés", async () => {
  const { context, page } = await startGame({}, ['Émilie', 'Hugo']);
  try {
    assert.equal(await page.locator('[data-node="p0"]').getAttribute('aria-label'), 'Planète d’Émilie');
    assert.equal(await page.locator('[data-node="p1"]').getAttribute('aria-label'), 'Planète d’Hugo');
    await page.evaluate(() => { window.FuseeApp.getGame().rng = () => 0.4; });
    await page.getByRole('button', { name:'Lancer le dé', exact:true }).last().click();
    await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
    await page.locator('#die-confirm').click({ force:true });
    await page.evaluate(() => {
      for (const node of ['b0_1', 'b0_2', 'p0']) document.querySelector(`[data-node="${node}"]`).click();
    });
    await page.locator('.resource-modal').waitFor();
    assert.equal(await page.locator('.resource-modal .eyebrow').textContent(), 'Planète d’Émilie');
  } finally { await context.close(); }
});

for (const reducedMotion of ['no-preference', 'reduce']) {
test(`La navette reste animée avec clics rapides, symétrie et pause (${reducedMotion})`, async () => {
  const { context, page } = await startGame({ reducedMotion });
  try {
    await page.evaluate(() => {
      const game = window.FuseeApp.getGame();
      game.rng = () => 0.4;
      Object.assign(game.layout.points, { c:{ x:60, y:45 }, b0_1:{ x:40, y:45 }, b0_2:{ x:25, y:45 }, p0:{ x:10, y:45 } });
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => document.querySelector('.shuttle').dataset.motion === 'idle');
    await page.getByRole('button', { name:'Lancer le dé', exact:true }).last().click();
    await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
    await page.locator('#die-confirm').click({ force:true });
    const startingX = await page.locator('.shuttle').evaluate(el => { const rect = el.getBoundingClientRect(); return rect.left + rect.width / 2; });
    await page.evaluate(() => {
      const shuttle = document.querySelector('.shuttle');
      window.shuttleSegments = [];
      const animate = shuttle.animate.bind(shuttle);
      shuttle.animate = (frames, options) => { window.shuttleSegments.push({ frames, duration:options.duration }); return animate(frames, options); };
      window.shuttleFlightStarted = performance.now();
      for (const node of ['b0_1', 'b0_2', 'p0']) document.querySelector(`[data-node="${node}"]`).click();
    });
    await page.waitForFunction(() => document.querySelector('.shuttle').dataset.motion === 'moving');
    const heading = await page.locator('.shuttle img').evaluate(el => ({ flip:el.dataset.flip, angle:Number(el.dataset.angle) }));
    assert.equal(heading.flip, '-1');
    assert.equal(heading.angle, 180);
    await page.waitForTimeout(110);
    const during = await page.evaluate(() => {
      const shuttle = document.querySelector('.shuttle').getBoundingClientRect();
      const destination = document.querySelector('[data-node="p0"]').getBoundingClientRect();
      return { current:shuttle.left + shuttle.width / 2, final:destination.left + destination.width / 2 };
    });
    assert.ok(during.current < startingX && during.current > during.final, 'La navette doit être en translation entre le départ et la destination.');
    await page.screenshot({ path:path.join(screenshots, 'shuttle-moving-left.png') });
    await page.getByRole('button', { name:'Pause et options enseignant', exact:true }).click();
    await page.locator('.shuttle').evaluate(async el => {
      await Promise.all([...el.getAnimations(), ...el.querySelector('img').getAnimations()].map(animation => animation.ready));
    });
    const pausedPosition = await page.locator('.shuttle').evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(160);
    assert.equal(await page.locator('.shuttle').evaluate(el => getComputedStyle(el).transform), pausedPosition, 'La pause doit immobiliser la navette.');
    await page.getByRole('button', { name:'Reprendre', exact:true }).click();
    await page.locator('.resource-modal').waitFor();
    assert.equal(await page.evaluate(() => window.shuttleSegments.length), 3, 'Les trois segments doivent être parcourus.');
    const timing = await page.evaluate(() => ({ durations:window.shuttleSegments.map(segment => segment.duration), elapsed:performance.now() - window.shuttleFlightStarted }));
    assert.ok(timing.durations.every(duration => duration >= 600 && duration <= 1000), 'Chaque translation doit être assez lente pour être visible.');
    assert.ok(timing.elapsed >= 2700, `${timing.elapsed} ms pour trois étapes : le mouvement ne doit pas être supprimé ou expédié.`);
    const arrival = await page.evaluate(() => {
      const shuttle = document.querySelector('.shuttle').getBoundingClientRect();
      const destination = document.querySelector('[data-node="p0"]').getBoundingClientRect();
      return { dx:shuttle.left + shuttle.width / 2 - destination.left - destination.width / 2,
        dy:shuttle.top + shuttle.height / 2 - destination.top - destination.height / 2 };
    });
    assert.ok(Math.abs(arrival.dx) < 1 && Math.abs(arrival.dy) < 1, JSON.stringify(arrival));
  } finally { await context.close(); }
});
}

test('Une réponse incorrecte ne joue pas le son de collecte', async () => {
  const { context, page } = await startGame();
  try {
    await openAlphabetQuestion(page);
    await page.locator('[data-quiz-runtime-answer-input]').fill('chien');
    await page.getByRole('button', { name:'Valider', exact:true }).click();
    await page.locator('.quiz-runtime-answer-box--display.is-incorrect').waitFor();
    await page.getByRole('button', { name:"Fin de l'activité", exact:true }).click();
    await page.getByRole('heading', { name:'Pas cette fois', exact:true }).waitFor();
    assert.equal(await page.evaluate(() => window.FuseeApp.getGame().players[0].bag.eau), 0);
    assert.equal(await page.evaluate(() => window.audioEvents.filter(e => e.kind === 'play' && e.src.endsWith('collect.wav')).length), 0);
    assert.deepEqual(await page.evaluate(() => window.speechCalls), []);
  } finally { await context.close(); }
});

test('Chaque gain par événement joue collect.wav, les autres événements restent silencieux', async () => {
  const { context, page } = await startGame();
  try {
    const events = ['carburant', 'eau', 'provisions', 'outils', 'oxygene'].map(resource => ({ kind:'gain', resource }));
    events.push({ kind:'dustGain' }, { kind:'loss', resource:'eau' }, { kind:'calm' });
    let expectedCollects = 0;
    for (const event of events) {
      await page.evaluate(event => {
        const game = window.FuseeApp.getGame();
        game.rng = () => 0.999;
        game.pickEvent = () => ({ ...event });
      }, event);
      await page.getByRole('button', { name:'Lancer le dé', exact:true }).last().click();
      await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
      await page.locator('#die-confirm').click({ force:true });
      await page.getByRole('button', { name:'Continuer', exact:true }).waitFor();
      if (event.kind === 'gain' || event.kind === 'dustGain') expectedCollects++;
      assert.equal(await page.evaluate(() => window.audioEvents.filter(e => e.kind === 'play' && e.src.endsWith('collect.wav')).length), expectedCollects);
      await page.getByRole('button', { name:'Continuer', exact:true }).click();
    }
    const sounds = await page.evaluate(() => window.audioEvents.filter(e => e.kind === 'play').map(e => e.src));
    assert.equal(sounds.filter(src => src.endsWith('roll.wav')).length, events.length);
    assert.deepEqual(await page.evaluate(() => window.speechCalls), []);
  } finally { await context.close(); }
});

test('Le son désactivé coupe aussi les nouveaux effets et la collecte', async () => {
  const { context, page } = await startGame();
  try {
    await page.evaluate(() => {
      const game = window.FuseeApp.getGame();
      const trigger = document.querySelector('[data-action="sound"]');
      trigger.click();
      window.audioEvents = [];
      game.rng = () => 0.999;
      game.pickEvent = () => ({ kind:'gain', resource:'eau' });
    });
    await page.getByRole('button', { name:'Lancer le dé', exact:true }).last().click();
    await page.waitForFunction(() => !document.querySelector('#die-confirm')?.disabled);
    await page.locator('#die-confirm').click({ force:true });
    await page.getByRole('button', { name:'Continuer', exact:true }).waitFor();
    assert.equal(await page.evaluate(() => window.audioEvents.filter(e => e.kind === 'play').length), 0);
    assert.deepEqual(await page.evaluate(() => window.speechCalls), []);
  } finally { await context.close(); }
});

test('Les trois fichiers audio se décodent et le FLAC est lu nativement', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/games/fusee/style.css`);
    const files = await page.evaluate(async () => {
      const context = new AudioContext();
      try {
        const results = [];
        for (const name of ['roll.wav', 'navette.flac', 'collect.wav']) {
          const response = await fetch('/games/fusee/media/sons/jeu/' + name);
          if (!response.ok) throw Error(`${name}: ${response.status}`);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          results.push({ name, duration:buffer.duration, channels:buffer.numberOfChannels });
        }
        const audio = new Audio('/games/fusee/media/sons/jeu/navette.flac');
        audio.muted = true;
        await new Promise((resolve, reject) => {
          audio.onloadeddata = resolve;
          audio.onerror = () => reject(Error(`FLAC: ${audio.error?.message}`));
          audio.load();
        });
        await audio.play();
        audio.pause();
        return results;
      } finally { await context.close(); }
    });
    for (const file of files) {
      assert.ok(file.duration > 0 && file.channels > 0, JSON.stringify(file));
      console.log(`${file.name}: ${file.duration.toFixed(3)} s`);
    }
    assert.doesNotMatch(await fs.readFile(path.join(root, 'games/fusee/app.js'), 'utf8'), /speechSynthesis|SpeechSynthesisUtterance/);
  } finally { await page.close(); }
});
