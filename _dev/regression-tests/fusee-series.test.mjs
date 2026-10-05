// Run: node --test --test-isolation=none _dev/regression-tests/fusee-series.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import { normalizeCatalogActivity, buildCatalogActivityConfig } from "../../shared/catalogue.js";

// These checks use embedded quiz snapshots and never access Supabase.
globalThis.window = { supabase:{ createClient:() => ({}) } };
const { filterQuizSnapshotBySelection, getQuizSelectionItems, createQuestionDeck } = await import("../../tools/quiz/model.js");
const clone = value => JSON.parse(JSON.stringify(value));
const snapshot = {
  editorMode:"series",
  seriesModelId:"addition",
  questions:[{
    id:"addition",
    widgets:[{ id:"answer", type:"answer", questionText:"Combien ?", expectedAnswer:"2" }],
    variants:[
      { id:"row-1", widgets:[{ id:"answer", questionText:"1 + 1", expectedAnswer:"2" }] },
      { id:"row-2", widgets:[{ id:"answer", questionText:"1 + 2", expectedAnswer:"3" }] },
      { id:"row-3", widgets:[{ id:"answer", questionText:"2 + 2", expectedAnswer:"4" }] }
    ]
  }]
};
const source = await fs.readFile(new URL("../../games/fusee/app.js", import.meta.url), "utf8");
const engineSource = await fs.readFile(new URL("../../games/fusee/engine.js", import.meta.url), "utf8");

function makeHarness(activity) {
  const context = vm.createContext({
    window:{ addEventListener() {} },
    document:{ getElementById:() => ({}), addEventListener() {} },
    localStorage:{ getItem:() => null, setItem() {} },
    setInterval() {},
    normalizeCatalogActivity,
    buildCatalogActivityConfig
  });
  vm.runInContext(engineSource, context);
  // Expose the preparation functions without starting authentication or timers.
  const script = source.replace(/^import .*;\r?\n/gm, "").replace(/^init\(\);\r?$/m, `
    globalThis.api = { isRunnableActivity, activityTypeLabel, activitiesSetup, buildQuestionRuntimeConfig,
      assign(activity) { teacherActivities = [activity]; setActivity('carburant', activity.id); return clone(config.activities.carburant); }
    };
  `);
  vm.runInContext(script, context);
  const assignment = context.api.assign(clone(activity));
  return { api:context.api, assignment, E:context.window.FuseeEngine };
}

function makeSeries(overrides = {}) {
  return {
    id:"series-1", title:"Petites additions", activity_type:"series", difficulty_mode:"single",
    config_json:{ tool_id:"quiz", level:{ settings:{ quizSnapshot:clone(snapshot), drawMode:"random", questionSelection:{ mode:"all" } } } },
    ...overrides
  };
}

test("La Fusée propose et mémorise les séries dans les ressources", () => {
  const activity = makeSeries();
  const { api, assignment } = makeHarness(activity);
  assert.equal(api.isRunnableActivity(activity), true);
  assert.equal(api.isRunnableActivity({ activity_type:"series" }), false);
  assert.equal(api.activityTypeLabel(activity), "Série");
  assert.match(api.activitiesSetup(), /Petites additions · Série/);
  assert.doesNotMatch(api.activitiesSetup(), /ne sont pas proposées/);
  assert.deepEqual(clone(assignment.snapshot), activity);
});

test("Une série conserve sa banque et lance exactement une question", () => {
  const { api, assignment } = makeHarness(makeSeries());
  const runtime = api.buildQuestionRuntimeConfig(assignment);
  const item = runtime.sequence[0];
  assert.equal(item.toolId, "quiz");
  assert.deepEqual(item.draft.executionLimit, { mode:"questions", value:1 });
  assert.equal(item.draft.questionCount, 1);
  const settings = item.draft.settings;
  assert.equal(settings.quizSnapshot.editorMode, "series");
  assert.equal(settings.drawMode, "random");
  const pool = filterQuizSnapshotBySelection(settings.quizSnapshot, settings.questionSelection);
  assert.equal(pool.length, 3);
  assert.equal(new Set(pool.map(row => row.sourceDrawGroupId)).size, 3);
  // Every row can be drawn first; the container's first variant is not forced.
  const random = Math.random;
  const firstRows = new Set();
  try {
    for (const value of [0, 0.34, 0.99]) {
      Math.random = () => value;
      firstRows.add(createQuestionDeck(pool, settings.drawMode)[0].sourceVariantId);
    }
  } finally { Math.random = random; }
  assert.equal(firstRows.size, 3);
});

test("Une série adaptative respecte le niveau et les lignes sélectionnées", () => {
  const selectedKey = getQuizSelectionItems(snapshot)[1].selectionKey;
  const level = { settings:{ quizSnapshot:clone(snapshot), drawMode:"random", questionSelection:{ mode:"custom", questionKeys:[selectedKey] } } };
  const { api, assignment } = makeHarness(makeSeries({
    difficulty_mode:"adaptive", config_json:{ tool_id:"quiz" },
    levels_json:{ "1":{ settings:{ quizSnapshot:clone(snapshot) } }, "4":level }
  }));
  assignment.level = 4;
  const runtime = api.buildQuestionRuntimeConfig(assignment);
  assert.equal(runtime.catalog_difficulty_level, 4);
  const settings = runtime.sequence[0].draft.settings;
  const pool = filterQuizSnapshotBySelection(settings.quizSnapshot, settings.questionSelection);
  assert.equal(pool.length, 1);
  assert.equal(pool[0].sourceVariantId, "row-2");
  assert.deepEqual(runtime.sequence[0].draft.executionLimit, { mode:"questions", value:1 });
});

for (const correct of [true, false]) {
  test(`Une question de série reprise rapporte ${correct ? "une" : "aucune"} ressource`, () => {
    const { assignment, E } = makeHarness(makeSeries());
    const config = {
      players:["Léa", "Noah"], duration:30, dust:3,
      targets:Object.fromEntries(E.KEYS.map(key => [key, key === "carburant" ? 3 : 0])),
      activities:{ carburant:assignment }
    };
    const game = new E.Game(config);
    game.phase = "resource";
    game.questionFor("carburant");
    const restored = E.Game.restore(clone(game.snapshot()));
    assert.equal(restored.question.activity.snapshot.activity_type, "series");
    restored.resolveQuestion(correct);
    assert.equal(restored.players[0].bag.carburant, correct ? 1 : 0);
    assert.equal(restored.players[0].questions, 1);
    assert.equal(restored.phase, "notice");
    assert.throws(() => restored.resolveQuestion(correct), /Pas de question en cours/);
  });
}
