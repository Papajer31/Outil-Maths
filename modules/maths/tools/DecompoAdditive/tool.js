import * as config from "./config.js";
import * as activity from "./activity.js";
import { defineTool } from "../../../../shared/tool-contract.js";

export default defineTool("DécompoAdditive", "Décomposition additive", {
  meta: { version: 2 },

  getDefaultSettings: config.getDefaultSettings,

  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  mount: activity.mount,
  nextQuestion: activity.nextQuestion,
  showAnswer: activity.showAnswer,
  unmount: activity.unmount
});
