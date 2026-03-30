import * as config from "./config.js";
import * as activity from "./activity.js";
import {
  normalizeSettings,
  getPhraseCountForStudent,
  getPhraseTimeForStudent
} from "./model.js";
import {
  normalizeActivityGlobals,
  normalizeToolDraft
} from "../../../../shared/activity-config.js";
import {
  estimateStandardToolDuration
} from "../../../../shared/activity-duration.js";

export function estimateDuration({ draft, globals } = {}) {
  const safeDraft = normalizeToolDraft(draft);
  const safeGlobals = normalizeActivityGlobals(globals);
  const settings = normalizeSettings(safeDraft.settings);

  if (safeGlobals.mode !== "students") {
    return estimateStandardToolDuration({
      draft: safeDraft,
      globals: safeGlobals,
      hasAnswerPhase: false,
      questionCount: 1
    });
  }

  const selectedStudentIds = Array.isArray(settings.selectedStudentIds)
    ? settings.selectedStudentIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (selectedStudentIds.length === 0) {
    return estimateStandardToolDuration({
      draft: safeDraft,
      globals: safeGlobals,
      hasAnswerPhase: false,
      questionCount: 1
    });
  }

  let minSec = Number.POSITIVE_INFINITY;
  let maxSec = 0;

  for (const studentId of selectedStudentIds) {
    const student = { id: studentId };
    const questionCount = getPhraseCountForStudent(settings, student, 1);
    const timePerQ = getPhraseTimeForStudent(settings, student, safeDraft.timePerQ);

    const estimate = estimateStandardToolDuration({
      draft: safeDraft,
      globals: safeGlobals,
      hasAnswerPhase: false,
      questionCount,
      timePerQ
    });

    minSec = Math.min(minSec, estimate.minSec);
    maxSec = Math.max(maxSec, estimate.maxSec);
  }

  return {
    minSec: Number.isFinite(minSec) ? minSec : 0,
    maxSec: Math.max(Number.isFinite(minSec) ? minSec : 0, maxSec)
  };
}

export default {
  meta: { version: 2 },

  hasAnswerPhase: false,

  getQuestionCount(ctx) {
    const settings = normalizeSettings(ctx?.settings);
    return getPhraseCountForStudent(settings, ctx?.student, 1);
  },

  getQuestionTime(ctx) {
    const settings = normalizeSettings(ctx?.settings);
    return getPhraseTimeForStudent(
      settings,
      ctx?.student,
      ctx?.sessionItem?.timePerQ ?? 5
    );
  },

  estimateDuration,

  getDefaultSettings() {
    return {
      mode: "students",
      selectedStudentIds: [],
      selectionOrder: [],
      studentConfigs: {}
    };
  },

  requiresStudent: config.requiresStudent,

  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  mount: activity.mount,
  nextQuestion: activity.nextQuestion,
  showAnswer: () => {},
  unmount: activity.unmount
};
