import * as config from "./config.js";
import * as activity from "./activity.js";

export default {
  meta: { version: 2 },

  getDefaultSettings: config.getDefaultSettings,

  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  mount: activity.mount,
  nextQuestion: activity.nextQuestion,
  showAnswer: activity.showAnswer,
  unmount: activity.unmount
};
