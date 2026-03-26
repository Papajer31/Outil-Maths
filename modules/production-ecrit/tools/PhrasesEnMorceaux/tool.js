import * as config from "./config.js";
import * as activity from "./activity.js";
import {
  normalizeSettings,
  getPhraseCountForStudent,
  getPhraseTimeForStudent
} from "./model.js";

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

  getDefaultSettings() {
    return {
      mode: "students",
      selectedStudentIds: [],
      selectionOrder: [],
      studentConfigs: {}
    };
  },

  requiresStudent: config.requiresStudent,

  renderToolHeaderControls: config.renderToolHeaderControls,
  readToolHeaderControls: config.readToolHeaderControls,

  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  mount: activity.mount,
  nextQuestion: activity.nextQuestion,
  showAnswer: () => {},
  unmount: activity.unmount
};